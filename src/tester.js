'use strict';

const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const utils = require('./utils');

class Tester {
  constructor(rootDir, config) {
    this.rootDir_ = rootDir;
    this.config_ = config;
  }

  async downloadBuild(backend) {
    const buildUrl = this.config_.getBuildUrl(backend);
    const buildUrlArray = buildUrl.split('/');
    const buildName = buildUrlArray[buildUrlArray.length - 1];
    const saveDir = path.join(this.rootDir_, 'output', 'builds',
        this.config_.targetCommitId, buildUrlArray[buildUrlArray.length - 2]);

    if (fs.existsSync(saveDir)) {
      fs.removeSync(saveDir);
    }

    fs.mkdirpSync(saveDir);

    try {
      const buildFile = path.join(saveDir, buildName);
      await utils.download(buildUrl, buildFile);
      const buildMD5File = `${buildFile}.md5`;
      await utils.download(`${buildUrl}.md5`, buildMD5File);
      return utils.checkMD5(buildFile, buildMD5File);
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  async run(backend) {
    // extract build zip package
    const buildFile = path.join(this.rootDir_, 'output', 'builds',
        this.config_.targetCommitId,
        `${this.config_.targetOs}_${this.config_.targetCpu}_${backend}`,
        `webnn-${this.config_.targetOs}-${this.config_.targetCpu}-${backend}` +
        '.zip',
    );
    const unzipPath = path.join(os.tmpdir(),
        `${this.config_.targetCommitId}_${backend}`);

    if (fs.existsSync(unzipPath)) {
      fs.removeSync(unzipPath);
    }

    await utils.extractBuild(buildFile, unzipPath);

    // run tests and save results into csv files
    const resultsCSVDir = path.join(this.rootDir_, 'output', 'reports',
        this.config_.targetCommitId,
        `${this.config_.targetOs}_${this.config_.targetCpu}_${backend}`);

    if (!fs.existsSync(resultsCSVDir)) {
      fs.mkdirpSync(resultsCSVDir);
    }

    const resultsCSV = path.join(resultsCSVDir,
        `webnn-${this.config_.targetOs}-${this.config_.targetCpu}-${backend}` +
        '.csv');

    try {
      let result = {output: ''};
      if (['null', 'dml'].indexOf(backend) !== -1) {
        if (this.config_.targetOs === 'linux') {
          await utils.childCommand('./webnn_unittests', [], unzipPath, result);
        } else if (this.config_.targetOs === 'win') {
          await utils.childCommand(
              'webnn_unittests.exe', [], unzipPath, result);
        }
        await utils.saveResultsCSV(resultsCSV, result.output, 'UnitTests');
        if (this.config_.targetOs === 'win' && backend === 'dml') {
          result = {output: ''};
          await utils.childCommand(
              'webnn_end2end_tests.exe', [], unzipPath, result);
          await utils.saveResultsCSV(resultsCSV, result.output, 'End2EndTests');
        }
      } else if (backend === 'openvino') {
        if (this.config_.targetOs === 'linux') {
          await utils.childCommand(
              'bash', [this.config_.openvinoSetup]);
          await utils.childCommand('./webnn_unittests', [], unzipPath, result);
          await utils.saveResultsCSV(resultsCSV, result.output, 'UnitTests');
          result = {output: ''};
          await utils.childCommand(
              './webnn_end2end_tests', [], unzipPath, result);
          await utils.saveResultsCSV(resultsCSV, result.output, 'End2EndTests');
        } else if (this.config_.targetOs === 'win') {
          await utils.childCommand(
              'call', [this.config_.openvinoSetup]);
          await utils.childCommand(
              'webnn_unittests.exe', [], unzipPath, result);
          await utils.saveResultsCSV(resultsCSV, result.output, 'UnitTests');
          result = {output: ''};
          await utils.childCommand(
              'webnn_end2end_tests.exe', [], unzipPath, result);
          await utils.saveResultsCSV(resultsCSV, result.output, 'End2EndTests');
        }
      }
      fs.removeSync(unzipPath);
      return true;
    } catch (error) {
      console.error(error);
      fs.removeSync(unzipPath);
      return false;
    }
  }
}
module.exports = {
  Tester,
};
