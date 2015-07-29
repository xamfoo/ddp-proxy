Meteor.publish(null, function () {
  var self = this;
  self.added('fruits', 'fruit', {name: 'apple'});
  self.ready();
});
