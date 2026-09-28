// Node 24 can fail to resolve the sandboxed Windows account before tsx starts.
// Tests only need a stable temporary-directory name, so provide one here.
const os = require("node:os");

os.userInfo = () => ({
  uid: -1,
  gid: -1,
  username: "mailshield-test",
  homedir: process.cwd(),
  shell: null,
});
