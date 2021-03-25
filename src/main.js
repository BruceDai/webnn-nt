'use strict';

const path = require('path');
const {TesterConfig} = require('./tester_config');
const {Tester} = require('./tester');

(async () => {
  const rootDir = path.join(path.dirname(process.argv[1]), '..');
  console.log(`Root dir: ${rootDir}`);
  const configFile = path.join(rootDir, 'config.json');
  console.log(`Config file: ${configFile}`);
  const config = new TesterConfig(configFile);
  await config.init();
  const tester = new Tester(rootDir, config);
  config.targetBackend.forEach(async (b) => {
    const status = await tester.downloadBuild(b);
    if (status) {
      await tester.run(b);
    }
  });
})();
