import { defineConfig } from "wxt";

const e2eAiHostPermission = process.env.OFFER_STAR_E2E_AI === "1" ? ["http://127.0.0.1:4173/*"] : [];

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "极速海投",
    description: "极速海投简历助手，辅助填写招聘网站申请表单",
    icons: { 16: "icons/icon16.png", 32: "icons/icon32.png", 48: "icons/icon48.png", 128: "icons/icon128.png" },
    // 产品主入口是网页内悬浮面板，不申请浏览器原生侧边栏权限。
    permissions: ["storage", "activeTab", "scripting"],
    host_permissions: ["https://api.gfjianli.com/*", "https://offer.gfjianli.com/*", ...e2eAiHostPermission],
    action: { default_title: "打开极速海投简历助手", default_icon: { 16: "icons/icon16.png", 32: "icons/icon32.png" } },
    // 网页内悬浮面板通过 iframe 加载，必须显式暴露页面及其打包脚本。
    web_accessible_resources: [{
      resources: ["floating-panel.html", "chunks/*", "icons/icon128.png"],
      matches: ["http://*/*", "https://*/*"]
    }],
    browser_specific_settings: {
      gecko: {
        id: "offer-star-extension@example.com",
        data_collection_permissions: { required: ["none"] }
      }
    }
  }
});
