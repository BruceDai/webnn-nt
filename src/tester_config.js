'use strict';

const fs = require('fs-extra');
const http = require('http');
const path = require('path');
const winston = require('winston');
const cheerio = require('cheerio');
const url = require('url');

/** Class representing a testerConfig. */
class TesterConfig {
  /**
   * Create a testerConfig.
   * @param {string} configFile - The config json file.
   */
  constructor(configFile) {
    this.configFile_ = configFile;
    this.buildUrl_ = undefined;
    this.targetCommitId_ = undefined;
    this.targetBackend_ = undefined;

    // test device info
    this.device_ = {
      name: undefined,
      os: undefined,
      cpu: undefined,
    };

    // remote reports server to host report csv files and log files
    this.userHost_ = undefined;
    this.remoteDir_ = undefined;

    this.logger_ = undefined;
    this.logFile_ = undefined;
  }

  /** Init members. */
  async init() {
    fs.accessSync(this.configFile_);
    const config = JSON.parse(fs.readFileSync(this.configFile_, 'utf8'));
    this.buildUrl_ = config['build_url'];
    this.targetCommitId_ = config['target_commitId'];

    if (this.targetCommitId_ === 'latest') {
      this.targetCommitId_ = await this.getLatestCommitId();
    }

    this.resultsDir_ = path.join(
        path.dirname(this.configFile_), 'out', 'reports', this.targetCommitId);

    if (!fs.existsSync(this.resultsDir_)) {
      fs.mkdirpSync(this.resultsDir_);
    }

    this.targetBackend_ = config['target_backend'];

    this.device_.name = config['test_device']['name'];
    this.device_.os = config['test_device']['os'];
    this.device_.cpu = config['test_device']['cpu'];

    this.userHost_ = config['report_server']['user_host'];
    this.remoteDir_ =
        `${config['report_server']['dir']}/${this.targetCommitId_}`;

    const logLevel = config['log_level'];
    this.logFile_ = path.join(this.resultsDir_,
        `log-webnn-${this.device_.os}-${this.device_.cpu}-` +
        `${this.targetCommitId_}_${this.device_.name}.txt`,
    );

    if (fs.existsSync(this.logFile_)) {
      fs.unlinkSync(this.logFile_);
    }

    this.logger_ = winston.createLogger({
      level: logLevel,
      format: winston.format.simple(),
      transports: [
        new winston.transports.Console({
          colorize: true,
        }),
        new winston.transports.File({
          filename: this.logFile_,
        }),
      ],
    });

    // create a log file
    fs.writeFileSync(this.logFile_, '', {flag: 'w+'});
    this.logger_.info(`Config file: ${this.configFile_}`);
    this.logger_.info(`Target Backend: ${this.targetBackend_}`);
    this.logger_.info(`Target Commit Id: ${this.targetCommitId_}`);
    this.logger_.info(
        `Test Device: ${this.device_.name}/${this.device_.os}/` +
        `${this.device_.cpu}`);
    this.logger_.info(`Log Level: ${logLevel}`);
    this.logger_.info(`Log file: ${this.logFile_}`);
  }

  /**
   * Get target commit Id.
   * @return {string} target commit Id.
   */
  get targetCommitId() {
    return this.targetCommitId_;
  }

  /**
   * Get target backend array.
   * @return {object} target backend array.
   */
  get targetBackend() {
    return this.targetBackend_;
  }

  /**
   * Get test device info.
   * @return {object} test device info.
   */
  get device() {
    return this.device_;
  }

  /**
   * @return {string} results directory.
   */
  get resultsDir() {
    return this.resultsDir_;
  }

  /**
   * @return {obj} logger.
   */
  get logger() {
    return this.logger_;
  }

  /**
   * @return {string} log file.
   */
  get logFile() {
    return this.logFile_;
  }

  /**
   * @return {string} user and host of remote report server.
   */
  get userHost() {
    return this.userHost_;
  }

  /**
   * @return {string} directory of remote report server.
   */
  get remoteDir() {
    return this.remoteDir_;
  }

  /**
   * Get latest commit Id.
   * @return {string} latest commit Id.
   */
  async getLatestCommitId() {
    const getHtmlElements = async function(buildUrl) {
      // sorted build commits by 'Last modified' column of descending order
      const buildUrlWithParams = new url.URL(buildUrl);
      buildUrlWithParams.searchParams.append('C', 'M');
      buildUrlWithParams.searchParams.append('O', 'A');
      return new Promise((resolve, reject) => {
        let html;
        const options = {
          host: buildUrlWithParams.host,
          path: buildUrlWithParams.pathname + buildUrlWithParams.search,
          port: 80,
        };
        http.get(options, (res) => {
          res.on('data', (data) => {
            html += data;
          });
          res.on('end', () => {
            console.log(`html  ${html}`);
            const allHtmlElements = cheerio.load(html);
            resolve(allHtmlElements);
          });
        }).on('error', (err) => {
          console.error(`getHtmlElements func got error: ${err.message}`);
          reject(err);
        });
      });
    };

    let commitId;
    await getHtmlElements(this.buildUrl_).then((elements) => {
      // get latest commit id
      commitId = elements('a')[elements('a')
          .length-1]['attribs']['href'].slice(0, -1);
    });

    const saveCommitFile =
        path.join(path.dirname(this.configFile_), 'LatestCommitId');

    if (fs.existsSync(saveCommitFile)) {
      const lastCommitId = fs.readFileSync(saveCommitFile).toString();
      if (lastCommitId === commitId) {
        throw new Error('None new commit released');
      }
    }

    fs.writeFileSync(saveCommitFile, commitId);
    return commitId;
  }

  /**
   * Get build url.
   * @param {string} backend - value: 'null' / 'openvino' / 'dml'.
   * @return {string} build url.
   */
  getBuildUrl(backend) {
    return [this.buildUrl_, this.targetCommitId_,
      `${this.device_.os}_${this.device_.cpu}_${backend}`,
      `webnn-${this.device_.os}-${this.device_.cpu}-${backend}.zip`].join('/');
  }
}

module.exports = {TesterConfig};
