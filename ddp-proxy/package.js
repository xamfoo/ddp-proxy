Package.describe({
  name: 'xamfoo:ddp-proxy',
  version: '0.1.0',
  // Brief, one-line summary of the package.
  summary: 'Connection manager for a DDP proxy server',
  // URL to the Git repository containing the source code for this package.
  git: '',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.versionsFrom('1.1.0.2');
  api.use([
    'meteor',
    'ejson',
    'ddp',
    'underscore',
    'mongo',
  ], 'server');
  api.addFiles(['ddp-proxy.js'], 'server');
  api.export('DDPProxy', 'server');
});

Package.onTest(function(api) {
  api.use([
    'tinytest',
    'mongo',
    'accounts-password',
    'sha',
  ], 'server');
  api.use('xamfoo:ddp-proxy');
  api.addFiles(['test-fixtures.js', 'ddp-proxy-tests.js'], 'server');
});