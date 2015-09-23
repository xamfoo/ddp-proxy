var Future = Npm.require('fibers/future');

function subscribeSync (connection /*, arguments*/) {
  var args = Array.prototype.slice.call(arguments, 1);
  var future = new Future;
  connection.subscribe.apply(connection, args.concat({
    onReady: function () { future['return'](); },
    onError: function (e) { future['return'](e); }
  }));
  return future.wait();
}

function methodCallSync (connection /*, arguments*/) {
  var args = Array.prototype.slice.call(arguments, 1);
  var call = Meteor.wrapAsync(connection.call, connection);
  return call.apply(connection, args);
};

var loginOptions = {
  user: {email: 'test@test.com'},
  password: {
    algorithm: 'sha-256',
    digest: SHA256('test')
  }
};

// Set up DDP server listener
var DDPServer = (function () {
  function DDPServer () {
    var self = this;
    self._listeners = [];

    Meteor.server.stream_server.register(function (socket) {
      socket.on('data', function () {
        var socketSelf = this;
        var args = arguments;

        self._listeners.forEach(function (listener) {
          listener.apply(socketSelf, args);
        });
      });
    });
  }
  DDPServer.prototype.addListener = function (fn) {
    return this._listeners.push(fn);
  };
  DDPServer.prototype.removeListener = function (fn) {
    var self = this;
    var index = self._listeners.indexOf(fn);
    if (index >= 0) self._listeners.splice(index, 1);
  };
  return new DDPServer;
}());

Tinytest.add(
  'Indicate ddpproxy support in connection request', function (test) {
    var proxy = new DDPProxy;
    var testCount = 0;
    var listener = Meteor.bindEnvironment(function (raw_msg) {
      try {
        raw_msg = JSON.parse(raw_msg);
        if (raw_msg && raw_msg.msg === 'connect') {
          test.equal(
            raw_msg.support && raw_msg.support.indexOf('ddpproxy') >= 0,
            true
          );
          testCount += 1;
        }
      }
      catch (e) {}
    });
    DDPServer.addListener(listener);
    var connection = proxy.connect();
    test.equal(testCount > 0, true);
    DDPServer.removeListener(listener);

    proxy.stop();
  }
);

Tinytest.add(
  'No ddpproxy support in connection request when autopublish option is true',
  function (test) {
    var proxy = new DDPProxy;
    var testCount = 0;
    var listener = Meteor.bindEnvironment(function (raw_msg) {
      try {
        raw_msg = JSON.parse(raw_msg);
        if (raw_msg && raw_msg.msg === 'connect') {
          test.equal(
            raw_msg.support && !(raw_msg.support.indexOf('ddpproxy') >= 0),
            true
          );
          testCount += 1;
        }
      }
      catch (e) {}
    });
    DDPServer.addListener(listener);
    var connection = proxy.connect({autoPublish: true});
    test.equal(testCount > 0, true);
    DDPServer.removeListener(listener);

    proxy.stop();
  }
);

Tinytest.add('New connection', function (test) {
  var proxy = new DDPProxy();
  var connection = proxy.connect();
  test.equal(connection.status().connected, true);

  proxy.stop();
});

Tinytest.add('Subscribe on connection', function (test) {
  var proxy = new DDPProxy();
  var connection = proxy.connect();
  subscribeSync(connection, 'fruits');
  test.equal(connection.collections.fruits.find().count(), 1);
  test.equal(
    connection.collections.fruits.findOne().name, 'apple'
  );

  proxy.stop();
});

Tinytest.add('Call method on connection', function (test) {
  var proxy = new DDPProxy();
  var connection = proxy.connect();
  subscribeSync(connection, 'fruits');
  methodCallSync(connection, 'removeFruits');
  test.equal(connection.collections.fruits.find().count(), 0);
  methodCallSync(connection, 'addFruit', 'apple');
  test.equal(connection.collections.fruits.find().count(), 1);

  proxy.stop();
});

Tinytest.add('Resume session id', function (test) {
  var proxy = new DDPProxy();
  var connection;

  connection = proxy.connect({sessionId: 'apple'});
  subscribeSync(connection, 'fruits');
  methodCallSync(connection, 'removeFruits');
  methodCallSync(connection, 'addFruit', 'apple');
  test.equal(!!connection.collections.fruits, true);

  connection = proxy.connect();
  test.equal(!!connection.collections.fruits, false);

  connection = proxy.connect({sessionId: 'banana'});
  test.equal(!!connection.collections.fruits, false);

  connection = proxy.connect({sessionId: 'apple'});
  test.equal(!!connection.collections.fruits, true);
  test.equal(connection.collections.fruits.find().count(), 1);

  proxy.stop();
});

Tinytest.add('Resume object session id', function (test) {
  var proxy = new DDPProxy();
  var connection;

  connection = proxy.connect({sessionId: {apple: 1}});
  subscribeSync(connection, 'fruits');
  methodCallSync(connection, 'removeFruits');
  methodCallSync(connection, 'addFruit', 'apple');
  test.equal(!!connection.collections.fruits, true);

  connection = proxy.connect();
  test.equal(!!connection.collections.fruits, false);

  connection = proxy.connect({sessionId: {banana: 1}});
  test.equal(!!connection.collections.fruits, false);

  connection = proxy.connect({sessionId: {apple: 1}});
  test.equal(!!connection.collections.fruits, true);
  test.equal(connection.collections.fruits.find().count(), 1);

  proxy.stop();
});

Tinytest.add('Login with password', function (test) {
  var proxy = new DDPProxy;
  var connection = proxy.connect({login: loginOptions});
  test.equal(
    !!connection.loginStatus && !!connection.loginStatus.result &&
      !!connection.loginStatus.result.token,
    true
  );

  proxy.stop();
});

Tinytest.add('Login with invalid credentials', function (test) {
  var proxy = new DDPProxy;
  var connection = proxy.connect({login: {user: 'invalid@test.com'}});
  test.equal(
    !!connection.loginStatus && !!connection.loginStatus.error,
    true
  );

  proxy.stop();
});

Tinytest.add('Resume login with password', function (test) {
  var proxy = new DDPProxy;
  var connection = proxy.connect({login: loginOptions});
  var token = connection.loginStatus.result.token;
  var resume = proxy.connect({login: {resume: token}});
  test.equal(
    !!connection.loginStatus && !!connection.loginStatus.result &&
      !!connection.loginStatus.result.token,
    true
  );
});

Tinytest.add('Configure options', function (test) {
  var proxy = new DDPProxy;
  var oldConfig = proxy._config;
  var newConfig = {
    ddpConnection: {_dontPrintErrors: true},
    isValidSession: function () { return false; }
  }
  proxy.configure(newConfig);
  Object.keys(proxy._config).forEach(function (k) {
    if (k in newConfig) test.equal(proxy._config[k], newConfig[k]);
    else test.equal(proxy._config[k], oldConfig[k]);
  });

  proxy.stop();
});

Tinytest.add('Invalid url and connectionTimeout option', function (test) {
  var proxy = new DDPProxy(
    {connectionTimeout: 1, ddpConnection: {_dontPrintErrors: true}}
  );
  test.throws(function () {
    proxy.connect({url: 'http://1'});
  }, 'Connection timeout');
  proxy.stop();
});

Tinytest.add('Remove connection on close()', function (test) {
  var proxy = new DDPProxy;
  test.equal(Object.keys(proxy._connections).length, 0);
  test.equal(proxy._cln.find().count(), 0);

  var connection = proxy.connect();
  test.equal(Object.keys(proxy._connections).length, 1);
  test.equal(proxy._cln.find().count(), 1);

  connection.close();
  test.equal(Object.keys(proxy._connections).length, 0);
  test.equal(proxy._cln.find().count(), 0);

  proxy.stop();
});

Tinytest.add('connectionExpire option', function (test) {
  var proxy = new DDPProxy({
    connectionExpire: 0,
  });
  var connection = proxy.connect();
  var data = proxy._cln.findOne();
  test.equal(data.expire <= new Date, true);

  proxy.stop();
});

Tinytest.add('sessionExpire option', function (test) {
  var proxy = new DDPProxy({sessionExpire: 0});
  var connection = proxy.connect({sessionId: 'apple'});
  var data = proxy._cln.findOne({sessionId: 'apple'});
  test.equal(data.expire <= new Date, true);

  proxy.stop();
});

Tinytest.add('sessionExpireOnResume option', function (test) {
  var proxy = new DDPProxy({sessionExpireOnResume: 1234});
  var connection = proxy.connect({sessionId: 'apple'});

  connection = proxy.connect({sessionId: 'apple'});
  var data = proxy._cln.findOne({sessionId: 'apple'});
  test.equal(Math.abs(data.expire - (new Date) - 1234 * 1000) < 100, true);

  proxy.stop();
});

Tinytest.add('isValidSession option', function (test) {
  var proxy = new DDPProxy({isValidSession: function (sessionId) {
    if (sessionId && sessionId.name === 'apple') return true;
    return false;
  }});
  test.equal(proxy.connect({sessionId: '1234'}), undefined);
  test.equal(
    proxy.connect({sessionId: {name: 'apple'}}),
    proxy.connect({sessionId: {name: 'apple'}})
  );

  proxy.stop();
});

Tinytest.add(
  'Expiring connections and expireInterval option', function (test) {
    var proxy = new DDPProxy({expireInterval: 1});
    var connection = proxy.connect();
    proxy._cln.find().forEach(function (doc) {
      proxy._cln.update({_id: doc._id}, {$set: {expire: new Date}});
    });
    test.equal(proxy._cln.find().count(), 1);
    Meteor._sleepForMs(1100);
    test.equal(proxy._cln.find().count(), 0);

    proxy.stop();
  }
);

Tinytest.add('stopExpire()', function (test) {
  var proxy = new DDPProxy({expireInterval: 1});
  proxy.stopExpire();
  var connection = proxy.connect();
  proxy._cln.find().forEach(function (doc) {
    proxy._cln.update({_id: doc._id}, {$set: {expire: new Date(1)}});
  });
  test.equal(proxy._cln.find().count(), 1);
  Meteor._sleepForMs(1100);
  test.equal(proxy._cln.find().count(), 1);

  proxy.stop();
});

Tinytest.add('stop()', function (test) {
  var proxy = new DDPProxy({expireInterval: 1});
  var connection = proxy.connect();
  proxy._cln.find().forEach(function (doc) {
    proxy._cln.update({_id: doc._id}, {$set: {expire: new Date(1)}});
  });
  test.equal(proxy._cln.find().count(), 1);

  proxy.stop();
  test.equal(proxy._cln.find().count(), 0);
});
