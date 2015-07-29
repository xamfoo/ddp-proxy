# ddp-proxy

This Meteor server package manages multiple server DDP connections and
provides a few features on top of the standard `DDP.connect()`.

## Features

- Expire inactive connections
- Built-in login mechanism
- Resume connections based on session key and login credentials
- Automatic creation of required Mongo collections when subscribing

## Install

To create DDP proxy connections,

```
meteor add xamfoo:ddp-proxy
```

To accept DDP proxy connections,

```
meteor add xamfoo:ddp-proxy-endpoint
```

`ddp-proxy-endpoint` package prevents auto-published data from sending every
time a new DDP proxy connection is made. This reduces the network overhead if
the auto-published information is not always required.

### Dependencies
- `underscore`
- `ejson`
- `meteor`
- `mongo`
- `ddp`

## Getting Started

```javascript
var ddpProxy = new DDPProxy({url: 'http://localhost:3000'});
var connection = ddpProxy.connect();
connection.call('addFruit', function (err, res) { // Call a method
  console.log('method called', err, res);
});
connection.subscribe('fruits', function () { // Subscribe
  // Results are returned in connection.collections
  console.log(connection.collections.fruits.find().fetch());
});
```

## Usage

### `new DDPProxy([options])`

DDPProxy class

- {object} options - Configuration object. Refer to configure()
- {Mongo.Collection} options.collection[=localCollection] - Mongo
  collection used to store connection data. If not specified, connection
  info will be stored in memory.

### `ddpProxy.configure([options])`

Configure options

- {object} options
- {string} options.url - Default url for connection if not specified.
  Set to Meteor.absoluteUrl() if not specified.
- {number} options.connectionExpire[=900] - Time(seconds) before a
  non-session connection expires. Default is 15 minutes.
- {number} options.connectionTimeout[=10] - Time(seconds) before a
  connection attempt timeouts. Default is 10 seconds.
- {number} options.sessionExpire[=900] - Time(seconds) before a
  connection with a session id expires. Default is 15 minutes.
- {number} options.sessionExpireOnResume[=900] - The new expiry
  time(seconds) to set on the connection when a session is resumed. Default
  is 15 minutes.
- {number} options.expireInterval[=120] - Time interval to expire
  connections.
- {function} options.isValidSession - A function for checking
  if a DDP proxy session id is valid. By default it is a function that
  always return true.

### `ddpProxy.connect([options])`

Returns a DDP connection given the url of the server and login options

- {object} options
- {string} [options.url] - The connection url
- {\*} [options.sessionId] - Session id which is used to resume this
  connection. A session id must be a string or a serializable object.
- {object} [options.login] - Login options for Meteor
- {object} [options.login.resume] - Resume token for Meteor login

Example login with password:

```javascript
var ddpProxy = new DDPProxy;
var connection = ddpProxy.connect({
  login: {
    user: {email: 'test@test.com'},
    password: {
      algorithm: 'sha-256',
      digest: SHA256('test') // SHA256 from Meteor `sha` package
    }
  }
});

// Login with the obtained resume token
var connection2 = ddpProxy.connect({
  login: {
    resume: connection.loginStatus.result.token
  }
});
```

Example of resuming a connection:

```
var ddpProxy = new DDPProxy;
var connection = ddpProxy.connect({sessionId: 'mysession'});

var resumeConnection = ddpProxy.connect({sessionId: 'mysession'});
resumeConnection === connection // true
```

### `ddpProxy.startExpire()`

Start monitoring connections and remove expired connections.

### `ddpProxy.stopExpire()`

Stop monitoring connections expiry

### `ddpProxy.stop()`

Close all connections and stop monitoring

### `connection.collections`

An object which contains (collection name, Mongo.Collection) key value pairs
which are created when subscriptions requires them.

Example: 

### `connection.loginStatus`

Example loginStatus object:
```javascript
{
  "result": {
    // User id
    "id": "GiWKSpcXbamqbukZM",
    // User resume token
    "token": "uenZILN21QooIS9rsIXOcJwcl-iKG0puyzLCRR_0Tl4",
    "tokenExpires": {
      "$date": 1435649944694
    }
  }
}
```

Example loginStatus object(error):
```javascript
{
  "error": [errorObject]
}
```
