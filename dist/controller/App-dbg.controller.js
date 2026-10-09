sap.ui.define(["./BaseController"], function (__BaseController) {
  "use strict";

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule && typeof obj.default !== "undefined" ? obj.default : obj;
  }
  const BaseController = _interopRequireDefault(__BaseController);
  /**
   * @namespace pt.arquivo.imagesearch.controller
   */
  const App = BaseController.extend("pt.arquivo.imagesearch.controller.App", {
    onInit: function _onInit() {
      // apply content density mode to root view
      this.getView().addStyleClass(this.getOwnerComponent().getContentDensityClass());
    }
  });
  return App;
});
//# sourceMappingURL=App-dbg.controller.js.map
