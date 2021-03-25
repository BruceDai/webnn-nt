'use strict';

const path = require('path');
const {TesterConfig} = require('./tester_config');
const {Tester} = require('./tester');

(async () => {
  const rootDir = path.join(path.dirname(process.argv[1]), '..');
  const configFile = path.join(rootDir, 'config.json');
  const config = new TesterConfig(configFile);

  try {
    await config.init();
    const tester = new Tester(rootDir, config);
    for (const b of config.targetBackend) {
      const status = await tester.downloadBuild(b);
      if (status === 'SUCCEEDED') {
        config.logger.info(`Run test by ${b} backend.`);
        await tester.run(b);
      } else if (status === 'FAILED') {
        config.logger.info(
            `Failed to download ${b} build, please have a check.`);
      }
    }
    await tester.uploadLogFile();
  } catch (error) {
    if (error.message === 'None new commit released') {
      console.log(`Skip this test: ${error.message}.`);
    } else {
      console.error(`${error.message}`);
    }
  }
})();
