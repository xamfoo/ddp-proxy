// We trigger the creation of the session object by temporarily creating a
// DDP connection to the server
var tmpConnection = DDP.connect(Meteor.absoluteUrl());

// Not a very clean way, but we poll until we get a reference to a server
// session object
var interval = Meteor.setInterval(function () {
  var SessionKeys = Object.keys(Meteor.server.sessions);
  if (!SessionKeys.length) return;
  var Session = Meteor.server.sessions[SessionKeys[0]].constructor;

  // Wrap startUniversalSubs to check for Session.noAutoPublish
  Session.prototype.startUniversalSubs = (function (start) {
    return function () {
      var self = this;
      Meteor.setTimeout(function () {
        if (self.noAutoPublish) return;
        start.apply(self, arguments);
      }, 0);
    };
  })(Session.prototype.startUniversalSubs);

  // Wrap _handleConnect with another handle
  Meteor.server.constructor.prototype._handleConnect = (function (handle) {
    return function (socket, msg) {
      var self = this;
      handle.apply(self, arguments);

      if (msg && msg.support && msg.support.indexOf('ddpproxy') > -1) {
        socket._meteorSession.noAutoPublish = true;
      }
    };
  })(Meteor.server.constructor.prototype._handleConnect);

  // Make sure to clean up the connection
  tmpConnection.disconnect();
  // Stop polling
  Meteor.clearInterval(interval);
}, 500);
