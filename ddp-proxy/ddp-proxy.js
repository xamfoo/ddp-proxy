var Future = Npm.require('fibers/future');

// Get Connection constructor and supported DDP versions
var Connection = (function () {
  var connection = DDP.connect(Meteor.absoluteUrl());
  connection.close();
  return connection.constructor;
}());

/**
 * Extends the DDP connection class.
 */
var ProxyConnection = (function (_Connection) {
  function ProxyConnection () {
    var self = this;
    _Connection.apply(self, arguments);

    self.collections = self.collections || {};
    self._onClose = [];
    self._stream.on(
      'message',
      Meteor.bindEnvironment(self._onData.bind(self), Meteor._debug)
    );
  }
  ProxyConnection.prototype = Object.create(_Connection.prototype, {
    constructor: {
      value: ProxyConnection,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });
  if (Object.setPrototypeOf) Object.setPrototype(ProxyConnection, _Connection);
  else ProxyConnection.__proto__ = _Connection;

  // Callback for automatic creation of new mongo collections when data is
  // received
  ProxyConnection.prototype._onData = function (raw_msg) {
    var self = this;
    var msg;

    try {
      msg = DDPCommon.parseDDP(raw_msg);
    } catch (e) {
      return;
    }
    if (!msg || !msg.msg || !msg.collection) return;

    self.collections[msg.collection] =
      self.collections[msg.collection] ||
      new Mongo.Collection(msg.collection, {connection: self});
  };

  /**
   * Apply callbacks when connection is closed
   */
  ProxyConnection.prototype.close = function close () {
    var self = this;
    _Connection.prototype.close.apply(self, arguments);
    while (self._onClose.length) { self._onClose.pop()(); }
  };

  /**
   * Add a function callback when the connection is closed
   */
  ProxyConnection.prototype.onClose = function onClose (func) {
    if (typeof func !== 'function')
      throw new Error('Argument must be a function');
    this._onClose.push(func);
  };

  return ProxyConnection;
}(Connection));

/**
 * DDPProxy class objects manages multiple DDP connections to a server
 *
 * @param {object} options - Configuration object. Refer to configure()
 * @param {Mongo.Collection} options.collection[=localCollection] -
 *   Mongo collection used to store connection data. If not specified,
 *   connection info will be stored in memory.
 */
DDPProxy = function DDPProxy (opt) {
  var self = this;
  opt = opt || {};

  // DDP connections;
  self._connections = {};
  // Mongo collection to store connection state
  self._cln = opt.collection || new Mongo.Collection(null);

  // Id of interval to expire connections
  self._expireIntervalId = null;

  // Configuration
  self._config = {};
  self.configure(opt);
};

_.extend(DDPProxy.prototype, {
  _addConnection: function (opt) {
    var self = this;
    opt = opt || {};
    var url = opt.url;
    var sessionId = opt.sessionId;
    var loginOptions = opt.login;
    var connectFuture = new Future();
    var loginFuture = new Future();
    var connectionTimeout;
    var onConnected = _.partial(function (future) {
      Meteor.clearTimeout(connectionTimeout);
      !future.isResolved() && future['return']();
    }, connectFuture);
    var ddpOption = _.extend({}, self._config.ddpConnection, {
      onConnected: onConnected,
      supportedDDPVersions: !opt.autoPublish ?
        DDPCommon.SUPPORTED_DDP_VERSIONS.concat('ddpproxy') :
        DDPCommon.SUPPORTED_DDP_VERSIONS
    });
    if (self._config.ddpConnection.onConnected) {
      ddpOption.onConnected = _.partial(function (fn) {
        onConnected.apply(this, arguments);
        fn.apply(this, arguments);
      }, self._config.ddpConnection.onConnected);
    }
    var insertId;

    var connection = new ProxyConnection(url, ddpOption);
    connection.onClose(function () {
      delete self._connections[insertId];
      self._cln.remove({_id: insertId});
    });

    connectionTimeout = Meteor.setTimeout(function () {
      connection.close();
      !connectFuture.isResolved() && connectFuture['throw'](
        new Error('Connection timeout')
      );
    }, self._config.connectionTimeout * 1000);

    var doc = {
      url: url,
      sessionId: sessionId,
      resume: null,
      expire: sessionId ?
        new Date((new Date()).getTime() + self._config.sessionExpire * 1000) :
        new Date((new Date()).getTime() + self._config.connectionExpire * 1000)
    };
    var loginCallback = _.partial(
      function (controller, connection, future, err, res) {
        if (err) {
          connection.loginStatus = {error: err};
          controller._removeConnection(insertId);
        }
        else if (!res || !res.token) {
          connection.loginStatus = {error: new Error('No token was generated')};
          controller._removeConnection(insertId);
        }
        else {
          connection.loginStatus = {result: res};
          controller._cln.update({_id: insertId}, {$set: {resume: res.token}});
        }

        !future.isResolved() && future.return();
      }, self, connection, loginFuture
    );

    if (_.size(loginOptions) === 0) {
      insertId = self._cln.insert(doc);
      self._connections[insertId] = connection;
      loginFuture.return();
    }
    else {
      insertId = self._cln.insert(
        _.extend(doc, {resume: Random.id(42)})
      );
      self._connections[insertId] = connection;

      connection.onReconnect = function () {
        connection.call('login', loginOptions, loginCallback);
      };
      connection.reconnect();
    }

    connectFuture.wait();
    loginFuture.wait();

    return connection;
  },

  _removeConnection: function (connectionId) {
    var self = this;
    var connection = self._connections[connectionId];
    if (connection) connection.close();
  },

  _removeExpiredConnections: function () {
    var self = this;
    var now = new Date();
    self._cln.find({expire: {$lt: now}}).forEach(function (doc) {
      self._removeConnection(doc._id);
    });
    return self;
  },

  _resumeConnection: function (url, sessionId, resume) {
    var self = this;
    // resume = typeof resume === 'string' ? Accounts._hashLoginToken()

    var connectionData = self._cln.findOne({
      url: url, resume: resume, sessionId: sessionId,
      expire: {$gte: new Date}
    });
    if (!connectionData || !connectionData._id) return undefined;

    // Update expiry
    self._cln.update(
      {_id: connectionData._id},
      {
        $set: {
          expire: new Date(
            (new Date).getTime() + self._config.sessionExpireOnResume * 1000
          )
        }
      }
    );
    var connection = self._connections[connectionData._id];
    if (!connection || !connection.status) return undefined;

    var status = connection.status().status;
    if (status === 'failed' || status === 'offline') {
      self._removeConnection(connectionData._id);
      return undefined;
    }

    return connection;
  },

  /**
   * Configure options
   *
   * @param {object} options
   * @param {string} options.url -
   *   Default url for connection if not specified.
   *   Set to Meteor.absoluteUrl() if not specified.
   * @param {number} options.connectionExpire[=900] -
   *   Time(seconds) before a non-session connection expires. Default is 15
   *   minutes.
   * @param {number} options.connectionTimeout[=10] -
   *   Time(seconds) before a connection attempt timeouts. Default is 10
   *   seconds.
   * @param {number} options.sessionExpire[=900] -
   *   Time(seconds) before a connection with a session id expires. Default is
   *   15 minutes.
   * @param {number} options.sessionExpireOnResume[=900] -
   *   The new expiry time(seconds) to set on the connection when a session is
   *   resumed. Default is 15 minutes.
   * @param {number} options.expireInterval[=120] -
   *   Time interval to expire connections.
   * @param {function} options.isValidSession -
   *   A function for checking if a DDP proxy session id is valid. By default
   *   it is a function that always return true.
   */
  configure: function (options) {
    // Don't handle if options is not an object
    if (typeof options !== 'object') return undefined;

    var self = this;
    var defaultOpt = {
      url: Meteor.absoluteUrl(),
      connectionExpire: 900, // 15 minutes
      connectionTimeout: 10,
      sessionExpire: 900, // 15 minutes
      sessionExpireOnResume: 900, // 15 minutes
      expireInterval: 120, // 2 minutes
      ddpConnection: {}, // Options for DDP connection
      // User-defined function to check validity of session ids
      isValidSession: function () { return true; }
    };
    self._config = _.defaults(options, defaultOpt);

    // Restart expire handler with new interval
    self.startExpire();

    return self;
  },

  /**
   * Creates a DDP ProxyConnection to the given server url and login options
   *
   * @param {object} options
   * @param {string} [options.url] - The connection url
   * @param {*} [options.sessionId] -
   *   Session id which is used to resume this connection. A session id must be
   *   a string or a serializable object.
   * @param {object} [options.login] - Login options for Meteor
   * @param {object} [options.login.resume] - Resume token for Meteor login
   * @param {boolean} options.autoPublish[=false] -
   *   If autoPublish is set to true, the connection will subscribe to
   *   autopublished data.
   */
  connect: function (opt) {
    var self = this;
    opt = opt || {};
    opt.url = opt.url || self._config.url; // Use default url if not specified
    if (typeof opt.url !== 'string') throw new Meteor.Error('Invalid url');
    if (typeof opt.login !== 'object') opt.login = {};
    var connection;

    // Attempt to resume session
    if ('sessionId' in opt) {
      if (!self._config.isValidSession(opt.sessionId)) return undefined;
      if (typeof opt.sessionId !== 'string')
        opt.sessionId = EJSON.stringify(opt.sessionId, {canonical: true});

      connection = self._resumeConnection(
        opt.url, opt.sessionId, opt.login.resume
      );
      if (connection) return connection;
    }

    // Create new connection
    return self._addConnection(opt);
  },

  /**
   * Start monitoring connections expiry and remove expired connections.
   */
  startExpire: function () {
    var self = this;
    var interval = self._config.expireInterval * 1000; // Convert to ms
    if (interval < 0 || !isFinite(interval)) interval = 60000;

    self.stopExpire(); // Stop existing interval

    self._expireIntervalId = Meteor.setInterval(function () {
      self._removeExpiredConnections();
    }, interval);

    return self;
  },

  /**
   * Stop monitoring connections expiry
   */
  stopExpire: function () {
    var self = this;
    self._expireIntervalId && Meteor.clearInterval(self._expireIntervalId);
    self._expireIntervalId = null;
    return self;
  },

  /**
   * Close all connections and stop monitoring
   */
  stop: function () {
    var self = this;
    self.stopExpire();
    self._cln.find().forEach(function (doc) {
      var conn = self._connections[doc._id];
      if (conn) conn.close();
    });
  }
});
