declare module 'apollo-link-offline' {
  import type { ApolloLink, NextLink, Operation, gql } from '@apollo/client';
  import type { AsyncStorageStatic } from '@react-native-community/async-storage';

  type Options = Partial<{
    storage: AsyncStorageStatic;
    retryInterval: number;
    sequential: boolean;
    retryOnServerError: boolean;
  }>;

  export const syncStatusQuery: ReturnType<typeof gql>;

  export default class OfflineLink extends ApolloLink {
    constructor(options: Options);

    request(operation: Operation, forward: NextLink): any;

    migrate(): Promise<void>;

    getQueue(): Promise<Map<string, Record<string, any>>>;

    saveQueue(attemptId: string, item: Record<string, any>): void;

    updateStatus(inflight: boolean): void;

    add(item): string;

    remove(itemId: string): void;

    sync(): Promise<void>;

    setup(client: any): Promise<void>;
  }
}
