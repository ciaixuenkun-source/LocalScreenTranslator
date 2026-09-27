const translatedText = document.getElementById("translatedText");
const pinButton = document.getElementById("pinButton");
let pinned = false;

window.translationResult.onData((data) => {
  translatedText.textContent = data.text;
});

pinButton.addEventListener("click", async () => {
  pinned = await window.translationResult.setPinned(!pinned);
  pinButton.setAttribute("aria-pressed", String(pinned));
  pinButton.querySelector("span").textContent = pinned ? "已固定" : "固定";
  pinButton.title = pinned ? "取消固定" : "固定结果框";
});

document.getElementById("closeButton").addEventListener("click", () => {
  window.translationResult.close();
});
