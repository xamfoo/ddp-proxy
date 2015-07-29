Fruits = new Mongo.Collection('fruits');
Fruits.find().forEach(function (doc) {
  Fruits.remove({_id: doc._id});
});
Fruits.insert({name: 'apple'});

Meteor.publish('fruits', function () { return Fruits.find(); });

Meteor.methods({
  addFruit: function (name) {
    if (name) { Fruits.insert({name: name}); }
  },
  removeFruits: function () {
    Fruits.find().forEach(function (doc) {
      Fruits.remove({_id: doc._id});
    });
  }
});

Meteor.users.find().forEach(function (doc) {
  Meteor.users.remove({_id: doc._id});
});
Accounts.createUser({
  username: 'test',
  email: 'test@test.com',
  password: 'test'
});
