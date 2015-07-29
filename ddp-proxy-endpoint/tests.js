Tinytest.add('Stop autopublish for DDP proxy connections', function (test) {
  var proxy = new DDPProxy;
  var connection = proxy.connect();

  Meteor._sleepForMs(1000);
  test.equal(Object.keys(connection.collections).length === 0, true);

  proxy.stop();
});

Tinytest.add('Does not affect normal DDP connections', function (test) {
  var connection = DDP.connect(Meteor.absoluteUrl());
  var Fruits = new Mongo.Collection('fruits', {connection: connection});
  Meteor._sleepForMs(1000);
  test.equal(Fruits.find().count() > 0, true);
  connection.close();
});
