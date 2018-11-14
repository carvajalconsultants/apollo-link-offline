# apollo-link-offline ![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg) ![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)
An Apollo Link to queue mutations when offline or network errors exist.

**NOTICE:** This is still experimental, any comments and/or pull requests are welcome!

### Setup

```bash
yarn add apollo-link-offline
```

### Example
#### React Native

```javascript
import { AsyncStorage } from "react-native";
import ApolloClient from "apollo-client";
import { ApolloLink } from "apollo-link";
import { InMemoryCache } from "apollo-cache-inmemory";
import OfflineLink from "apollo-link-offline";
import { persistCache } from "apollo-cache-persist";

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

await persistCache({
  cache,
  storage: AsyncStorage,
  maxSize: false,
  debug: false
});

offlineLink.setup(client);

export default client;
```
