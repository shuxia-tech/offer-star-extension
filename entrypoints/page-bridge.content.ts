import { defineContentScript } from "wxt/utils/define-content-script";
import { installOfferStarPageBridge } from "../src/content/page-bridge";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  allFrames: true,
  runAt: "document_start",
  world: "MAIN",
  main() {
    installOfferStarPageBridge();
  }
});
