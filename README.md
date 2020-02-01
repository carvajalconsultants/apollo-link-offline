# apollo-link-offline ![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg) ![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)
An Apollo Link to queue mutations when offline or network errors exist.

Biggest different between this module and other offline modules available is that this module assumes the worst. It assumes the request will not reach the server and
queues all mutations, responds with optimistic response and removes the mutation from the queue when the server responds success.

Reason for this assumption is twofold:
1. Speed, since all mutations have optimistic response, the UI feels much snappier (like a local app)
2. In cases where the the network is NOT offline but really slow (think 2G in a third world country) and the request doesn't reach the server anyway,
   our queue retries until the server responds with success.

Tested with Apollo version 3.0.0-beta.23

### Setup

```bash
yarn add apollo-link-offline
```

### Example
#### React Native

```javascript
import React, { useState, useEffect } from "react";
import { AsyncStorage } from "react-native";
import { ApolloClient, ApolloLink, InMemoryCache } from "apollo-link";
import OfflineLink from "apollo-link-offline";
import { persistCache } from "apollo-cache-persist";

export default function App() {
  const [client, setClient] = useState(undefined);

  useEffect(() => {
    const serverLink = new HttpLink({
      ... Your regular HttpLink options here ...
    });

    const offlineLink = new OfflineLink({
      storage: AsyncStorage
    });

    const cache = new InMemoryCache();

    const client = new ApolloClient({
      link: ApolloLink.from([offlineLink, serverLink]),
      cache,
      defaultOptions: {
        watchQuery: {
          fetchPolicy: "cache-and-network",
          errorPolicy: "all",
        },
        query: {
          fetchPolicy: "cache-and-network",
          errorPolicy: "all",
        },
        mutate: {
          errorPolicy: "all"
        }
      }
    });

    persistCache({
      cache,
      storage: AsyncStorage,
      maxSize: false,
      debug: false
    }).then(() => {
      setClient(client);
    });

    offlineLink.setup(client);

    return () => {};
  }, []);

  if (client === undefined) return <Text>Loading...</Text>;

  return (
      <ApolloProvider client={client}>
        ... Your components here, make sure to add optimistic response to your mutations ...
      </ApolloProvider>
  );
}
```
