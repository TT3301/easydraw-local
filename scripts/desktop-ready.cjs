// The renderer is local. HTTP_PROXY/HTTPS_PROXY must not route its readiness
// probe through a system proxy, which can leave Electron waiting indefinitely.
module.exports = {
  proxy: false,
  httpTimeout: 3000,
  timeout: 60000,
};
