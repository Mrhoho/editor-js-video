/**
 * Video Tool for the Editor.js
 *
 * @author CodeX <team@codex.so>
 * @license MIT
 * @see {@link https://github.com/editor-js/video}
 *
 * To developers.
 * To simplify Tool structure, we split it to 4 parts:
 *  1) index.js — main Tool's interface, public API and methods for working with data
 *  2) uploader.js — module that has methods for sending files via AJAX: from device, by URL or File pasting
 *  3) ui.js — module for UI manipulations: render, showing preloader, etc
 *  4) tunes.js — working with Block Tunes: render buttons, handle clicks
 *
 * For debug purposes there is a testing server
 * that can save uploaded files and return a Response {@link UploadResponseFormat}
 *
 *       $ node dev/server.js
 *
 * It will expose 8008 port, so you can pass http://localhost:8008 with the Tools config:
 *
 * video: {
 *   class: VideoTool,
 *   config: {
 *     endpoints: {
 *       byFile: 'http://localhost:8008/uploadFile',
 *       byUrl: 'http://localhost:8008/fetchUrl',
 *     }
 *   },
 * },
 */

/**
 * @typedef {object} VideoToolData
 * @description Video Tool's input and output data format
 * @property {string} caption — video caption
 * @property {boolean} withBorder - should video be rendered with border
 * @property {boolean} withBackground - should video be rendered with background
 * @property {boolean} stretched - should video be stretched to full width of container
 * @property {object} file — Video file data returned from backend
 * @property {string} file.url — video URL
 */

import './index.css';

import Ui from './ui';
import Uploader from './uploader';

/**
 * @typedef {object} VideoConfig
 * @description Config supported by Tool
 * @property {object} endpoints - upload endpoints
 * @property {string} endpoints.byFile - upload by file
 * @property {string} endpoints.byUrl - upload by URL
 * @property {string} field - field name for uploaded video
 * @property {string} types - available mime-types
 * @property {string} captionPlaceholder - placeholder for Caption field
 * @property {object} additionalRequestData - any data to send with requests
 * @property {object} additionalRequestHeaders - allows to pass custom headers with Request
 * @property {string} buttonContent - overrides for Select File button
 * @property {object} [uploader] - optional custom uploader
 * @property {function(File): Promise.<UploadResponseFormat>} [uploader.uploadByFile] - method that upload video by File
 * @property {function(string): Promise.<UploadResponseFormat>} [uploader.uploadByUrl] - method that upload video by URL
 */

/**
 * @typedef {object} UploadResponseFormat
 * @description This format expected from backend on file uploading
 * @property {number} success - 1 for successful uploading, 0 for failure
 * @property {object} file - Object with file data.
 *                           'url' is required,
 *                           also can contain any additional data that will be saved and passed back
 * @property {string} file.url - [Required] video source URL
 */
export default class VideoTool {
  /**
   * Notify core that read-only mode is supported
   *
   * @returns {boolean}
   */
  static get isReadOnlySupported() {
    return true;
  }

  /**
   * Get Tool toolbox settings
   * icon - Tool icon's SVG
   * title - title to show in toolbox
   *
   * @returns {{icon: string, title: string}}
   */
  static get toolbox() {
    return {
      icon: '<svg t="1679305865141" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="994" width="24" height="24"><path d="M669.44 897.28H334.08c-136.96 0-248.32-107.52-248.32-240.64V368.64C85.76 236.8 197.12 128 334.08 128h337.92c135.68 0 245.76 107.52 245.76 240.64v290.56c0 131.84-111.36 238.08-248.32 238.08z m-335.36-704c-101.12 0-184.32 79.36-184.32 176.64v288c0 97.28 83.2 176.64 184.32 176.64h335.36c101.12 0 184.32-78.08 184.32-174.08V368.64c0-97.28-81.92-176.64-181.76-176.64H334.08z" p-id="995"></path><path d="M446.72 427.52c3.84 0 6.4 1.28 10.24 2.56l115.2 66.56c12.8 7.68 12.8 25.6 0 33.28l-115.2 66.56c-2.56 1.28-6.4 2.56-10.24 2.56-10.24 0-19.2-7.68-19.2-19.2V446.72c0-11.52 8.96-19.2 19.2-19.2m0-51.2c-38.4 0-70.4 32-70.4 70.4v133.12c0 38.4 32 70.4 70.4 70.4 12.8 0 24.32-3.84 35.84-8.96l115.2-66.56c21.76-12.8 35.84-35.84 35.84-61.44s-14.08-48.64-35.84-61.44l-115.2-66.56c-10.24-6.4-23.04-8.96-35.84-8.96z" p-id="996"></path></svg>',
      title: 'Video',
    };
  }

  /**
   * Available video tools
   *
   * @returns {Array}
   */
  static get tunes() {
    return [];
  }

  /**
   * @param {object} tool - tool properties got from editor.js
   * @param {VideoToolData} tool.data - previously saved data
   * @param {VideoConfig} tool.config - user config for Tool
   * @param {object} tool.api - Editor.js API
   * @param {boolean} tool.readOnly - read-only mode flag
   */
  constructor({ data, config, api, readOnly }) {
    this.api = api;
    this.readOnly = readOnly;

    /**
     * Tool's initial config
     */
    this.config = {
      endpoints: config.endpoints || '',
      additionalRequestData: config.additionalRequestData || {},
      additionalRequestHeaders: config.additionalRequestHeaders || {},
      field: config.field || 'video',
      types: config.types || 'video/*',
      captionPlaceholder: this.api.i18n.t(
        config.captionPlaceholder || 'Caption'
      ),
      buttonContent: config.buttonContent || '',
      uploader: config.uploader || undefined,
      actions: config.actions || [],
    };

    /**
     * Module for file uploading
     */
    this.uploader = new Uploader({
      config: this.config,
      onUpload: (response) => this.onUpload(response),
      onError: (error) => this.uploadingFailed(error),
    });

    /**
     * Module for working with UI
     */
    this.ui = new Ui({
      api,
      config: this.config,
      onSelectFile: () => {
        this.uploader.uploadSelectedFile({
          onPreview: (src) => {
            this.ui.showPreloader(src);
          },
        });
      },
      readOnly,
    });

    /**
     * Set saved state
     */
    this._data = {};
    this.data = data;
  }

  /**
   * Renders Block content
   *
   * @public
   *
   * @returns {HTMLDivElement}
   */
  render() {
    return this.ui.render(this.data);
  }

  /**
   * Validate data: check if Video exists
   *
   * @param {VideoToolData} savedData — data received after saving
   * @returns {boolean} false if saved data is not correct, otherwise true
   * @public
   */
  validate(savedData) {
    return savedData.file && savedData.file.url;
  }

  /**
   * Return Block data
   *
   * @public
   *
   * @returns {VideoToolData}
   */
  save() {
    const caption = this.ui.nodes.caption;

    this._data.caption = caption.innerHTML;

    return this.data;
  }

  /**
   * Returns configuration for block tunes: add background, add border, stretch video
   *
   * @public
   *
   * @returns {Array}
   */
  renderSettings() {
    // Merge default tunes with the ones that might be added by user
    // @see https://github.com/editor-js/video/pull/49
    const tunes = VideoTool.tunes.concat(this.config.actions);

    return tunes.map((tune) => ({
      icon: tune.icon,
      label: this.api.i18n.t(tune.title),
      name: tune.name,
      toggle: tune.toggle,
      isActive: this.data[tune.name],
      onActivate: () => {
        /* If it'a user defined tune, execute it's callback stored in action property */
        if (typeof tune.action === 'function') {
          tune.action(tune.name);

          return;
        }
        this.tuneToggled(tune.name);
      },
    }));
  }

  /**
   * Fires after clicks on the Toolbox Video Icon
   * Initiates click on the Select File button
   *
   * @public
   */
  appendCallback() {
    this.ui.nodes.fileButton.click();
  }

  /**
   * Specify paste substitutes
   *
   * @see {@link https://github.com/codex-team/editor.js/blob/master/docs/tools.md#paste-handling}
   * @returns {{tags: string[], patterns: object<string, RegExp>, files: {extensions: string[], mimeTypes: string[]}}}
   */
  static get pasteConfig() {
    return {
      /**
       * Paste HTML into Editor
       */
      tags: [
        {
          video: { src: true },
        },
      ],
      /**
       * Paste URL of video into the Editor
       * .avi / .wmv / .mov / .webm / .mpeg4 / .ts / .mpg / .rm / .rmvb / .mkv / .mp4
       */
      patterns: {
        video:
          /https?:\/\/\S+\.(avi|wmv|mov|webm|mpeg4|ts|mpg|rm|rmvb|mkv|mp4)(\?[a-z0-9=]*)?$/i,
      },

      /**
       * Drag n drop file from into the Editor
       */
      files: {
        mimeTypes: [ 'video/*' ],
      },
    };
  }

  /**
   * Specify paste handlers
   *
   * @public
   * @see {@link https://github.com/codex-team/editor.js/blob/master/docs/tools.md#paste-handling}
   * @param {CustomEvent} event - editor.js custom paste event
   *                              {@link https://github.com/codex-team/editor.js/blob/master/types/tools/paste-events.d.ts}
   * @returns {void}
   */
  async onPaste(event) {
    switch (event.type) {
      case 'tag': {
        const video = event.detail.data;

        /** Videos from PDF */
        if (/^blob:/.test(video.src)) {
          const response = await fetch(video.src);
          const file = await response.blob();

          this.uploadFile(file);
          break;
        }

        this.uploadUrl(video.src);
        break;
      }
      case 'pattern': {
        const url = event.detail.data;

        this.uploadUrl(url);
        break;
      }
      case 'file': {
        const file = event.detail.file;

        this.uploadFile(file);
        break;
      }
    }
  }

  /**
   * Private methods
   * ̿̿ ̿̿ ̿̿ ̿'̿'\̵͇̿̿\з= ( ▀ ͜͞ʖ▀) =ε/̵͇̿̿/’̿’̿ ̿ ̿̿ ̿̿ ̿̿
   */

  /**
   * Stores all Tool's data
   *
   * @private
   *
   * @param {VideoToolData} data - data in Video Tool format
   */
  set data(data) {
    this.video = data.file;

    this._data.caption = data.caption || '';
    this.ui.fillCaption(this._data.caption);

    VideoTool.tunes.forEach(({ name: tune }) => {
      const value =
        typeof data[tune] !== 'undefined'
          ? data[tune] === true || data[tune] === 'true'
          : false;

      this.setTune(tune, value);
    });
  }

  /**
   * Return Tool data
   *
   * @private
   *
   * @returns {VideoToolData}
   */
  get data() {
    return this._data;
  }

  /**
   * Set new video file
   *
   * @private
   *
   * @param {object} file - uploaded file data
   */
  set video(file) {
    this._data.file = file || {};

    if (file && file.url) {
      this.ui.fillVideo(file.url);
    }
  }

  /**
   * File uploading callback
   *
   * @private
   *
   * @param {UploadResponseFormat} response - uploading server response
   * @returns {void}
   */
  onUpload(response) {
    if (response.success && response.file) {
      this.video = response.file;
    } else {
      this.uploadingFailed('incorrect response: ' + JSON.stringify(response));
    }
  }

  /**
   * Handle uploader errors
   *
   * @private
   * @param {string} errorText - uploading error text
   * @returns {void}
   */
  uploadingFailed(errorText) {
    console.log('Video Tool: uploading failed because of', errorText);

    this.api.notifier.show({
      message: this.api.i18n.t('Couldn’t upload video. Please try another.'),
      style: 'error',
    });
    this.ui.hidePreloader();
  }

  /**
   * Callback fired when Block Tune is activated
   *
   * @private
   *
   * @param {string} tuneName - tune that has been clicked
   * @returns {void}
   */
  tuneToggled(tuneName) {
    // inverse tune state
    this.setTune(tuneName, !this._data[tuneName]);
  }

  /**
   * Set one tune
   *
   * @param {string} tuneName - {@link Tunes.tunes}
   * @param {boolean} value - tune state
   * @returns {void}
   */
  setTune(tuneName, value) {
    this._data[tuneName] = value;

    this.ui.applyTune(tuneName, value);

    if (tuneName === 'stretched') {
      /**
       * Wait until the API is ready
       */
      Promise.resolve()
        .then(() => {
          const blockId = this.api.blocks.getCurrentBlockIndex();

          this.api.blocks.stretchBlock(blockId, value);
        })
        .catch((err) => {
          console.error(err);
        });
    }
  }

  /**
   * Show preloader and upload video file
   *
   * @param {File} file - file that is currently uploading (from paste)
   * @returns {void}
   */
  uploadFile(file) {
    this.uploader.uploadByFile(file, {
      onPreview: (src) => {
        this.ui.showPreloader(src);
      },
    });
  }

  /**
   * Show preloader and upload video by target url
   *
   * @param {string} url - url pasted
   * @returns {void}
   */
  uploadUrl(url) {
    this.ui.showPreloader(url);
    this.uploader.uploadByUrl(url);
  }
}
