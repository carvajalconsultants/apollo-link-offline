import { ApolloLink, Observable } from "apollo-link";
import debounce from "lodash/debounce";
import uuidv4 from "uuid/v4";
import gql from "graphql-tag";

const syncStatusQuery = gql`
  query syncStatus {
    mutations
    inflight
  }
`;

export default class OfflineLink extends ApolloLink {
  /**
   * storage
   * Provider that will persist the mutation queue. This can be any AsyncStorage compatible storage instance.
   * 
   * retryInterval
   * Milliseconds between attempts to retry failed mutations. Defaults to 30,000 milliseconds.
   * 
   * sequential
   * Indicates if the attempts should be retried in order. Defaults to false which retries all failed mutations in parallel.
   * 
   * retryOnServerError
   * Indicates if mutations should be reattempted if there are server side errors, useful to retry mutations on session expiration. Defaults to false.
   */
  constructor({ storage, retryInterval = 30000, sequential = false, retryOnServerError = false }) {
    super();

    if (!storage) {
      throw new Error("Storage is required, it can be an AsyncStorage compatible storage instance.");
    }

    this.storage = storage;
    this.sequential = sequential;
    this.retryOnServerError = retryOnServerError;
    this.queue = new Map();
    this.delayedSync = debounce(this.sync, retryInterval);
    this.prefix = 'offlineLink';
  }

  request(operation, forward) {
    const me = this,
          context = operation.getContext(),
          { query, variables } = operation || {};

    if (!context.optimisticResponse) {
      // If the mutation does not have an optimistic response then we don't defer it
      return forward(operation);
    }

    return new Observable(observer => {
      const attemptId = this.add({mutation: query, variables, optimisticResponse: context.optimisticResponse});

      const subscription = forward(operation).subscribe({
        next: result => {
          // Mutation was successful so we remove it from the queue since we don't need to retry it later
          this.remove(attemptId);

          observer.next(result);
        },

        error: async networkError => {
          // Mutation failed so we try again after a certain amount of time.
          this.delayedSync();

          // Resolve the mutation with the optimistic response so the UI can be updated
          observer.next({
            data: context.optimisticResponse,
            dataPresent: true,
            errors: []
          });

          // Say we're all done so the UI is re-rendered.
          observer.complete();
        },

        complete: () => observer.complete()
      });

      return () => {
        subscription.unsubscribe();
      };
    });
  }

  /**
   * If there exists the '@offlineLink' old file, migrate it into new multiple files
   */
  migrate() {
    let map;
    return this.storage.getItem("@offlineLink")
      .then(stored => {

        if (stored) {
          map = new Map(JSON.parse(stored));

          // Saving new version files
          map.forEach((value, key) => {
            this.storage.setItem(this.prefix + key, JSON.stringify(value));
          });

          // Saving new mutation Ids
          this.storage.setItem(this.prefix + "AttemptIds", [...map.keys()].join());

          // remove old version file
          this.storage.removeItem("@offlineLink");
        }
      })
      .catch(err => {
        // Most likely happens the first time a mutation attempt is being persisted.
      });
  }

  /**
   * Obtains the queue of mutations that must be sent to the server.
   * These are kept in a Map to preserve the order of the mutations in the queue.
   */
  async getQueue() {
    let storedAttemptIds = [],
      map;

    await this.migrate();

    return new Promise((resolve, reject) => {
      // Get all attempt Ids
      this.storage.getItem(this.prefix + "AttemptIds").then(storedIds => {
        map = new Map();

        if (storedIds) {
          storedAttemptIds = storedIds.split(",");

          storedAttemptIds.forEach((storedId, index) => {

            // Get file of name '<prefix><UUID>'
            this.storage.getItem(this.prefix + storedId).then(stored => {
              map.set(storedId, JSON.parse(stored));

              // We return the map
              if (index === storedAttemptIds.length - 1) {
                resolve(map);
              }
            });
          });
        } else {
          resolve(map);
        }
      })
      .catch(err => {
        // Most likely happens the first time a mutation attempt is being persisted.
        resolve(new Map());
      });
    });
  }

  /**
   * Persist the queue so mutations can be retried at a later point in time.
   */
  saveQueue(attemptId, item) {
    if (attemptId && item) {
      this.storage.setItem(this.prefix + attemptId, JSON.stringify(item));
    }

    // Saving Ids file
    this.storage.setItem(this.prefix + "AttemptIds", [...this.queue.keys()].join());

    this.updateStatus(false);
  }

  /**
   * Updates a SyncStatus object in the Apollo Cache so that the queue status can be obtained and dynamically updated.
   */
  updateStatus(inflight) {
    this.client.writeQuery({query: syncStatusQuery, data: {
      __typename: "SyncStatus",
      mutations: this.queue.size,
      inflight
    }});
  }

  /**
   * Add a mutation attempt to the queue so that it can be retried at a later point in time.
   */
  add(item) {
    // We give the mutation attempt a random id so that it is easy to remove when needed (in sync loop)
    const attemptId = uuidv4();

    this.queue.set(attemptId, item);

    this.saveQueue(attemptId, item);

    return attemptId;
  }

  /**
   * Remove a mutation attempt from the queue.
   */
  remove(attemptId) {
    this.queue.delete(attemptId);

    this.storage.removeItem(this.prefix + attemptId)

    this.saveQueue();
  }

  /**
   * Takes the mutations in the queue and try to send them to the server again.
   */
  async sync() {
    const queue = this.queue;

    if (queue.size < 1) {
      // There's nothing in the queue to sync, no reason to continue.

      return;
    }

    // Update the status to be "in progress"
    this.updateStatus(true);

    // Retry the mutations in the queue, the successful ones are removed from the queue
    if (this.sequential) {
      // Retry the mutations in the order in which they were originally executed

      const attempts = Array.from(queue);

      for (const [attemptId, attempt] of attempts) {
        const success = await this.client
          .mutate({...attempt, optimisticResponse: undefined})
          .then(() => {
            // Mutation was successfully executed so we remove it from the queue

            this.remove(attemptId)
            return true;
          })
          .catch(err => {
            if (this.retryOnServerError === false && err.networkError.response) {
              // There are GraphQL errors, which means the server processed the request so we can remove the mutation from the queue

              this.remove(attemptId)

              return true;
            } else {
              // There was a network error so we have to retry the mutation

              return false;
            }
          })
        ;

        if (!success) {
          // The last mutation failed so we don't attempt any more
          break;
        }
      }
    } else {
      // Retry mutations in parallel

      await Promise.all(Array.from(queue).map(([attemptId, attempt]) => {
        return this.client.mutate(attempt)
          // Mutation was successfully executed so we remove it from the queue
          .then(() => {
            this.remove(attemptId)
          })

          .catch(err => {
            if (this.retryOnServerError === false && err.networkError.response) {
              // There are GraphQL errors, which means the server processed the request so we can remove the mutation from the queue

              this.remove(attemptId)
            }
          })
        ;
      }));
    }

    // Remaining mutations in the queue are persisted
    this.saveQueue();

    if (queue.size > 0) {
      // If there are any mutations left in the queue, we retry them at a later point in time
      this.delayedSync();
    }
  }

  /**
   * Configure the link to use Apollo Client and immediately try to sync the queue (if there's anything there).
   */
  async setup(client) {
    this.client = client;
    this.queue = await this.getQueue();

    return this.sync();
  }
}

export { syncStatusQuery };
