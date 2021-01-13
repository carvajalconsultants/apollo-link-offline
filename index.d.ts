declare module 'apollo-link-offline' {
  import type { AsyncStorageStatic } from '@react-native-community/async-storage';
  import type gql from 'graphql-tag';
  import type { ApolloLink, Operation, NextLink } from '@apollo/client/link/core';

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

    async migrate(): Promise<void>;

    async getQueue(): Promise<Map<string, Record<string, any>>>;

    saveQueue(attemptId: string, item: Record<string, any>): void;

    updateStatus(inflight: boolean): void;

    add(item): string;

    remove(itemId: string): void;

    async sync(): Promise<void>;

    async setup(client: any): Promise<void>;
  }
}
