'use strict';

const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const utils = require('./utils');

/** Class representing a tester. */
class Tester {
  /**
   * Create a tester.
   * @param {string} rootDir - The root directory path.
   * @param {TesterConfig} config - The testerConfig.
   */
  constructor(rootDir, config) {
    this.rootDir_ = rootDir;
    this.config_ = config;
    this.logger_ = config.logger;
  }

  /**
   * Download build.
   * @param {string} backend - value: 'null' / 'openvino' / 'dml'
   * @return {string} download status: 'SUCCEEDED' / 'FAILED'
   */
  async downloadBuild(backend) {
    const buildUrl = this.config_.getBuildUrl(backend);
    const buildUrlArray = buildUrl.split('/');
    const buildName = buildUrlArray[buildUrlArray.length - 1];
    const saveDir = path.join(this.rootDir_, 'out', 'builds',
        this.config_.targetCommitId, buildUrlArray[buildUrlArray.length - 2]);

    if (fs.existsSync(saveDir)) {
      fs.removeSync(saveDir);
    }

    fs.mkdirpSync(saveDir);

    const buildFile = path.join(saveDir, buildName);
    await utils.download(this.logger_, buildUrl, buildFile);
    const buildMD5File = `${buildFile}.md5`;
    await utils.download(
        this.logger_, `${buildUrl}.md5`, buildMD5File);
    return utils.checkMD5(this.logger_, buildFile, buildMD5File);
  }

  /**
   * Run build.
   * @param {string} backend - value: 'null' / 'openvino' / 'dml'
   */
  async run(backend) {
    // Extract build zip package
    const buildFile = path.join(this.rootDir_, 'out', 'builds',
        this.config_.targetCommitId,
        `${this.config_.device.os}_${this.config_.device.cpu}_${backend}`,
        `webnn-${this.config_.device.os}-${this.config_.device.cpu}-` +
        `${backend}.zip`,
    );
    const unzipPath = path.join(os.tmpdir(),
        `${this.config_.targetCommitId}_${backend}`);

    if (fs.existsSync(unzipPath)) {
      fs.removeSync(unzipPath);
    }

    await utils.extractBuild(this.logger_, buildFile, unzipPath);

    // Run tests and save results into csv files
    const resultsCSV = path.join(this.config_.resultsDir,
        `webnn-${backend}-${this.config_.device.os}-` +
        `${this.config_.device.cpu}-${this.config_.targetCommitId}_` +
        `${this.config_.device.name}.csv`);
    try {
      let result = {output: ''};
      if (backend === 'null') {
        // Run UnitTests by null backend
        if (this.config_.device.os === 'linux') {
          await utils.childCommand(
              this.logger_, './webnn_unittests', [], unzipPath, result);
        } else if (this.config_.device.os === 'win') {
          await utils.childCommand(this.logger_, 'webnn_unittests.exe', [],
              unzipPath, result);
        }
        await utils.saveResultsCSV(
            this.logger_, resultsCSV, result.output, 'UnitTests');
      } else {
        if (this.config_.device.os === 'linux') {
          // Run End2EndTests
          await utils.childCommand(this.logger_, './webnn_end2end_tests', [],
              unzipPath, result);
          await utils.saveResultsCSV(
              this.logger_, resultsCSV, result.output, 'End2EndTests');
          // Run LeNet example
          result = {output: ''};
          await utils.childCommand(this.logger_,
              './LeNet -m examples/LeNet/lenet.bin ' +
              '-i examples/LeNet/images/0.idx -n 201', [], unzipPath, result);
          await utils.saveResultsCSV(this.logger_, resultsCSV, result.output,
              'Examples', 'LeNet');
        } else if (this.config_.device.os === 'win') {
          // Run End2EndTests
          await utils.childCommand(
              this.logger_, 'webnn_end2end_tests.exe', [], unzipPath, result);
          await utils.saveResultsCSV(
              this.logger_, resultsCSV, result.output, 'End2EndTests');
          // Run LeNet example
          result = {output: ''};
          await utils.childCommand(this.logger_,
              'LeNet.exe -m examples\\LeNet\\lenet.bin ' +
              '-i examples\\LeNet\\images\\0.idx -n 201',
              [], unzipPath, result);
          await utils.saveResultsCSV(this.logger_, resultsCSV, result.output,
              'Examples', 'LeNet');
        }
      }
      // Upload results CSV file onto Reports Server
      await utils.uploadResults(this.logger_, resultsCSV, this.config_.userHost,
          this.config_.remoteDir, this.config_.resultsDir);
      fs.removeSync(unzipPath);
    } catch (error) {
      fs.removeSync(unzipPath);
      throw error;
    }
  }

  /** Upload log file. */
  async uploadLogFile() {
    await utils.uploadResults(this.logger_, this.config_.logFile,
        this.config_.userHost, this.config_.remoteDir, this.config_.resultsDir);
  }
}

module.exports = {Tester};
