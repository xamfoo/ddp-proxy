Package.describe({
  name: 'xamfoo:ddp-proxy-endpoint',
  version: '0.1.0',
  // Brief, one-line summary of the package.
  summary: 'Server package to support xamfoo:ddp-proxy',
  // URL to the Git repository containing the source code for this package.
  git: '',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
});

function configure (api) {
  api.versionsFrom('1.0.4.1');
  api.use(['meteor', 'ddp', 'underscore'], 'server');

  api.addFiles('ddp-proxy-endpoint.js', 'server');
}

Package.onUse(function(api) {
  configure(api);
});

Package.onTest(function(api) {
  configure(api);
  api.use(['tinytest', 'mongo'], 'server');
  api.use('xamfoo:ddp-proxy', 'server');
  api.addFiles(['test-fixtures.js', 'tests.js'], 'server');
});
