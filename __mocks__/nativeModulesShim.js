// jest-expo v55 does require('react-native/Libraries/BatchedBridge/NativeModules').default
// but RN 0.76 uses module.exports (CJS), so .default is undefined. This shim provides
// the same structure as RN's jest mock (from react-native/jest/setup.js) plus .default=self.
const fn = () => jest.fn();
const shim = {
  AlertManager: { alertWithArgs: jest.fn() },
  AsyncLocalStorage: {
    multiGet: jest.fn((keys, cb) => process.nextTick(() => cb(null, []))),
    multiSet: jest.fn((entries, cb) => process.nextTick(() => cb(null))),
    multiRemove: jest.fn((keys, cb) => process.nextTick(() => cb(null))),
    multiMerge: jest.fn((entries, cb) => process.nextTick(() => cb(null))),
    clear: jest.fn(cb => process.nextTick(() => cb(null))),
    getAllKeys: jest.fn(cb => process.nextTick(() => cb(null, []))),
  },
  DeviceInfo: {
    getConstants() {
      return {
        Dimensions: {
          window: { fontScale: 2, height: 1334, scale: 2, width: 750 },
          screen: { fontScale: 2, height: 1334, scale: 2, width: 750 },
        },
      };
    },
  },
  DevSettings: { addMenuItem: jest.fn(), reload: jest.fn() },
  ImageLoader: {
    getSize: jest.fn(url => Promise.resolve([320, 240])),
    getSizeWithHeaders: jest.fn(() => Promise.resolve({ height: 222, width: 333 })),
    prefetchImage: jest.fn(),
    prefetchImageWithMetadata: jest.fn(),
    queryCache: jest.fn(),
  },
  ImageViewManager: {
    getSize: jest.fn((uri, success) => process.nextTick(() => success(320, 240))),
    prefetchImage: jest.fn(),
  },
  KeyboardObserver: { addListener: jest.fn(), removeListeners: jest.fn() },
  Networking: {
    sendRequest: jest.fn(),
    abortRequest: jest.fn(),
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  },
  PlatformConstants: {
    getConstants() {
      return { reactNativeVersion: { major: 1000, minor: 0, patch: 0, prerelease: undefined } };
    },
  },
  SourceCode: { getConstants() { return { scriptURL: null }; } },
  StatusBarManager: {
    setColor: jest.fn(),
    setStyle: jest.fn(),
    setHidden: jest.fn(),
    setNetworkActivityIndicatorVisible: jest.fn(),
    setBackgroundColor: jest.fn(),
    setTranslucent: jest.fn(),
    getConstants: () => ({ HEIGHT: 42 }),
  },
  Timing: { createTimer: jest.fn(), deleteTimer: jest.fn() },
  UIManager: {},
  BlobModule: {
    getConstants: () => ({ BLOB_URI_SCHEME: 'content', BLOB_URI_HOST: null }),
    addNetworkingHandler: jest.fn(),
    enableBlobSupport: jest.fn(),
    disableBlobSupport: jest.fn(),
    createFromParts: jest.fn(),
    sendBlob: jest.fn(),
    release: jest.fn(),
  },
  WebSocketModule: {
    connect: jest.fn(),
    send: jest.fn(),
    sendBinary: jest.fn(),
    ping: jest.fn(),
    close: jest.fn(),
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  },
  I18nManager: {
    allowRTL: jest.fn(),
    forceRTL: jest.fn(),
    swapLeftAndRightInRTL: jest.fn(),
    getConstants: () => ({ isRTL: false, doLeftAndRightSwapInRTL: true }),
  },
};
shim.default = shim;
module.exports = shim;
