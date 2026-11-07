import { App } from "@modelcontextprotocol/ext-apps";

const app = new App(
  { name: "Independent SDK widget", version: "1" },
  {},
  { autoResize: false },
);
app.ontoolresult = (result) => {
  document.body.dataset.initial = JSON.stringify(result);
};
app.onhostcontextchanged = (context) => {
  document.body.dataset.theme = context.theme;
};
app
  .connect()
  .then(() => {
    document.body.dataset.connected = "yes";
  })
  .catch((error) => {
    document.body.dataset.error = String(error);
  });
Object.assign(window, {
  callFromWidget: () =>
    app.callServerTool({ name: "weather", arguments: { city: "London" } }),
  disposeWidget: () => app.close(),
});
