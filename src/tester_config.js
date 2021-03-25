'use strict';

const fs = require('fs-extra');
const http = require('http');
const os = require('os');
const path = require('path');
const winston = require('winston');
const cheerio = require('cheerio');
const url = require('url');

class TesterConfig {
  constructor(config) {
    this.config_ = config;
    this.buildUrl_ = undefined;
    this.targetOs_ = undefined;
    this.targetCpu_ = undefined;
    this.targetCommitId_ = undefined;
    this.targetBackend_ = undefined;
    this.openvinoSetup_ = undefined;

    // // server for host report csv
    // this.archiveServer_ = {
    //   host: undefined,
    //   dir: undefined,
    //   sshUser: undefined,
    // };

    // // email_service
    // this.emailService_ = {
    //   user: undefined,
    //   host: undefined,
    //   from: undefined,
    //   to: undefined,
    //   subject: undefined,
    //   text: undefined,
    // };

    this.logger_ = undefined;
  }

  async init() {
    fs.accessSync(this.config_);
    const config = JSON.parse(fs.readFileSync(this.config_, 'utf8'));
    this.buildUrl_ = config['build_url'];
    this.targetOs_ = config['target_os'];
    this.targetCpu_ = config['target_cpu'];
    this.targetCommitId_ = config['target_commitId'];
    this.openvinoSetup_ = config['openvino_setup'];

    if (this.targetCommitId_ === 'latest') {
      this.targetCommitId_ = await this.getLatestCommitId();
    }

    this.targetBackend_ = config['target_backend'];

    // this.archiveServer_.host = config['archive_server']['host'];
    // this.archiveServer_.dir = config['archive_server']['dir'];
    // this.archiveServer_.sshUser = config['archive_server']['ssh_user'];

    // this.emailService_.user = config['email_service']['user'];
    // this.emailService_.host = config['email_service']['host'];
    // this.emailService_.from = config['email_service']['from'];
    // this.emailService_.to = config['email_service']['to'];

    const logLevel = config['log_level'];
    const logFile = path.join(os.tmpdir(),
        `webnn_${this.targetOs_}_${this.targetCpu_ }_${this.targetCommitId_}` +
        '.log',
    );

    if (fs.existsSync(logFile)) {
      fs.unlinkSync(logFile);
    }

    this.logger_ = winston.createLogger({
      level: logLevel,
      format: winston.format.simple(),
      transports: [
        new winston.transports.Console({
          colorize: true,
        }),
        new winston.transports.File({
          filename: logFile,
        }),
      ],
    });

    // create log file
    fs.writeFileSync(logFile, '', {flag: 'w+'});
    this.logger_.debug(`Target Backend: ${this.targetBackend_}`);
    this.logger_.debug(`Target Commit Id: ${this.targetCommitId_}`);
    this.logger_.debug(`Target OS: ${this.targetOs_}`);
    this.logger_.debug(`Target CPU: ${this.targetCpu_}`);
    this.logger_.debug(`Log Level: ${logLevel}`);
    this.logger_.debug(`Log file: ${logFile}`);
  }

  /**
   * @return {object} target backend array.
   */
  get targetBackend() {
    return this.targetBackend_;
  }

  /**
   * @return {string} target OS.
   */
  get targetOs() {
    return this.targetOs_;
  }

  /**
   * @return {string} target CPU.
   */
  get targetCpu() {
    return this.targetCpu_;
  }

  /**
   * @return {string} target commit Id.
   */
  get targetCommitId() {
    return this.targetCommitId_;
  }

  /**
   * @return {string} OpenVINO Setup script path.
   */
  get openvinoSetup() {
    return this.openvinoSetup_;
  }

  /**
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

    fs.writeFileSync('./LatestCommitId', commitId);
    return commitId;
  }

  /**
   * @param {string} backend
   * @return {string} build url.
   */
  getBuildUrl(backend) {
    return [this.buildUrl_, this.targetCommitId_,
      `${this.targetOs_}_${this.targetCpu_}_${backend}`,
      `webnn-${this.targetOs_}-${this.targetCpu_}-${backend}.zip`].join('/');
  }
}

module.exports = {
  TesterConfig,
};
