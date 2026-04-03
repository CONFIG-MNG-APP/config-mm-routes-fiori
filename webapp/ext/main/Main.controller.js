sap.ui.define(
  [
    "zgsp26/conf/mng/mmroutes/confmngfemmroutes/ext/shared/ConfMngBaseController",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/SelectDialog",
    "sap/m/StandardListItem",
    "../shared/ExcelImport",
  ],
  function (
    BaseController,
    MessageToast,
    MessageBox,
    JSONModel,
    Filter,
    FilterOperator,
    SelectDialog,
    StandardListItem,
    ExcelImport,
  ) {
    "use strict";

    return BaseController.extend(
      "zgsp26.conf.mng.mmroutes.confmngfemmroutes.ext.main.Main",
      {
        // ── Abstract overrides ────────────────────────────────────────────
        _getModuleId:  function () { return "MM"; },
        _getConfName:  function () { return "MM Route Configuration"; },
        _getTargetCds: function () { return "ZI_MM_ROUTE_CONF"; },

        // ── Excel import config (MM Routes specific) ──────────────────────
        _getExcelImportConfig: function () {
          return {
            headerMap: {
              "plant":           "PlantId",
              "plantid":         "PlantId",
              "plant_id":        "PlantId",
              "plant id":        "PlantId",
              "sendwh":          "SendWh",
              "send wh":         "SendWh",
              "send_wh":         "SendWh",
              "sending wh":      "SendWh",
              "recvwh":          "ReceiveWh",
              "recv wh":         "ReceiveWh",
              "receivewh":       "ReceiveWh",
              "receive wh":      "ReceiveWh",
              "receive_wh":      "ReceiveWh",
              "receiving wh":    "ReceiveWh",
              "transport":       "TransMode",
              "transmode":       "TransMode",
              "trans_mode":      "TransMode",
              "transport mode":  "TransMode",
              "allowed":         "IsAllowed",
              "isallowed":       "IsAllowed",
              "is_allowed":      "IsAllowed",
              "inspector":       "InspectorId",
              "inspectorid":     "InspectorId",
              "inspector_id":    "InspectorId",
              "inspector id":    "InspectorId",
              "changenote":      "ChangeNote",
              "change note":     "ChangeNote",
              "change_note":     "ChangeNote",
              "note":            "ChangeNote",
            },
            boolFields: ["IsAllowed"],
            buildRow: function (sEnvId) {
              return {
                ItemId:      "",
                EnvId:       sEnvId || "DEV",
                PlantId:     "",
                SendWh:      "",
                ReceiveWh:   "",
                TransMode:   "",
                IsAllowed:   false,
                InspectorId: "",
                ChangeNote:  "",
                VersionNo:   0,
                ActionType:  "C",
                _state:      "new",
                _reqItemId:  null,
              };
            },
          };
        },

        onInit: function () {
          this._oModel = this.getView().getModel() || this.getOwnerComponent().getModel();

          // JSONModel for table (delta approach — only changed rows go to req table)
          this._aMainRows  = [];
          this._aFieldDef  = [];   // loaded from ZCONFFIELDDEF via catalog service
          this.getView().setModel(new JSONModel({ rows: [] }), "tableData");

          const oUIModel = new JSONModel({ editMode: true, requestCreated: false, viewOnly: false });
          this.getView().setModel(oUIModel, "ui");

          const oFilterModel = new JSONModel({
            EnvId: "", PlantId: "", SendWh: "", ReceiveWh: "",
            TransMode: "", Allowed: "", InspectorId: "", Search: "",
          });
          this.getView().setModel(oFilterModel, "filter");

          const oRequestContext = this._getUrlParams();
          this.getView().setModel(new JSONModel(oRequestContext), "requestContext");

          const bHasReqId  = !!oRequestContext.ReqId;
          const sStatus    = oRequestContext.Status || (bHasReqId ? "Draft" : "Not Created");
          const oRequestModel = new JSONModel({
            ReqId:       oRequestContext.ReqId || "",
            ReqItemId:   "",
            ConfId:      oRequestContext.ConfId || "",
            ReqTitle:    "",
            Status:      sStatus,
            StatusState: this._statusToState(sStatus),
            Reason:      "",
          });
          this.getView().setModel(oRequestModel, "request");

          if (oRequestContext.ConfId) {
            this._fetchFieldDef(oRequestContext.ConfId);
          }

          if (bHasReqId) {
            const bIsDraft    = sStatus.toUpperCase() === "DRAFT";
            const bIsRejected = sStatus.toUpperCase() === "REJECTED";
            const bCanEdit    = bIsDraft || bIsRejected;
            oUIModel.setProperty("/requestCreated", true);
            oUIModel.setProperty("/editMode", bIsDraft);   // auto-edit only for Draft
            oUIModel.setProperty("/viewOnly", !bCanEdit);  // lock Edit for Submitted/Approved/etc.
            this._fetchRequestHeader(oRequestContext.ReqId);
            this._fetchReqItem(oRequestContext.ReqId);
            this._loadMainTableWithOverlay(oRequestContext.EnvId, oRequestContext.ReqId);
          } else if (oRequestContext.Mode === "VIEW") {
            oUIModel.setProperty("/editMode", false);
            oUIModel.setProperty("/viewOnly", true);
            this._loadMainTable(oRequestContext.EnvId || "DEV");
          }

          console.log("requestContext =", oRequestContext);
        },

        onCancel: async function () {
          const oView  = this.getView();
          const sReqId = oView.getModel("request").getProperty("/ReqId");
          const sEnvId = oView.getModel("requestContext").getProperty("/EnvId") || "DEV";

          oView.setBusy(true);
          try {
            if (sReqId) {
              await this._loadMainTableWithOverlay(sEnvId, sReqId);
            } else {
              // No request yet — reset to original main table copy
              oView.getModel("tableData").setProperty("/rows", this._aMainRows.map(r => ({ ...r })));
            }
            this._applyBaseFilter();
          } finally {
            oView.setBusy(false);
          }
          oView.getModel("ui").setProperty("/editMode", false);
          MessageToast.show("Đã hủy thay đổi");
        },

        onCreate: function () {
          const sReqId = this.getView().getModel("request").getProperty("/ReqId");
          if (!sReqId) {
            MessageBox.warning("Please create a request first before adding route lines.");
            return;
          }

          const oTableModel = this.getView().getModel("tableData");
          const aRows       = oTableModel.getProperty("/rows");
          aRows.unshift({
            ItemId:      "",
            EnvId:       this.getView().getModel("requestContext").getProperty("/EnvId") || "DEV",
            PlantId:     "",
            SendWh:      "",
            ReceiveWh:   "",
            TransMode:   "",
            IsAllowed:   false,
            InspectorId: "",
            ChangeNote:  "",
            VersionNo:   0,
            ActionType:  "C",
            _state:      "new",
            _reqItemId:  null,
          });
          oTableModel.setProperty("/rows", aRows);
          this._applyBaseFilter();
          MessageToast.show("New row added — fill in the fields and save.");
        },

        /* ── Import from Excel ─────────────────────────────── */

        _xlsxPromise: null,

        _ensureXlsxLoaded: function () {
          if (window.XLSX) return Promise.resolve();
          if (this._xlsxPromise) return this._xlsxPromise;

          var sPath = sap.ui.require.toUrl(
            "zgsp26/conf/mng/mmroutes/confmngfemmroutes/lib/xlsx.min"
          ) + ".js";

          this._xlsxPromise = new Promise(function (resolve, reject) {
            var oScript = document.createElement("script");
            oScript.src = sPath;
            oScript.onload = resolve;
            oScript.onerror = function () { reject(new Error("Failed to load SheetJS library")); };
            document.head.appendChild(oScript);
          });
          return this._xlsxPromise;
        },

        onImportFromExcel: function () {
          var that = this;
          var sReqId = this.getView().getModel("request").getProperty("/ReqId");
          if (!sReqId) {
            MessageBox.warning("Please create a request first before importing.");
            return;
          }

          this._ensureXlsxLoaded().then(function () {
            var oInput = document.createElement("input");
            oInput.type = "file";
            oInput.accept = ".xls,.xlsx,.csv";
            oInput.style.display = "none";
            document.body.appendChild(oInput);

            oInput.addEventListener("change", function (oEvent) {
              var oFile = oEvent.target.files[0];
              if (!oFile) { document.body.removeChild(oInput); return; }

              var oReader = new FileReader();
              oReader.onload = function (e) {
                try {
                  that._processExcelData(e.target.result);
                } catch (err) {
                  MessageBox.error("Could not read the Excel file: " + err.message);
                }
                document.body.removeChild(oInput);
              };
              oReader.onerror = function () {
                MessageBox.error("Failed to read file.");
                document.body.removeChild(oInput);
              };
              oReader.readAsArrayBuffer(oFile);
            });

            oInput.click();
          }).catch(function (err) {
            MessageBox.error("Failed to load Excel library: " + err.message);
          });
        },

        _processExcelData: function (arrayBuffer) {
          var workbook = XLSX.read(arrayBuffer, { type: "array" });
          var sEnvId = this.getView().getModel("requestContext").getProperty("/EnvId") || "DEV";
          var result = ExcelImport.parseWorkbook(workbook, sEnvId, this._getExcelImportConfig());

          if (result.errors.length && !result.rows.length) {
            MessageBox.error(result.errors.join("\n"));
            return;
          }

          if (result.rows.length > 500) {
            var that = this;
            MessageBox.confirm(
              "The file contains " + result.rows.length + " rows. This may take a moment. Continue?",
              {
                onClose: function (sAction) {
                  if (sAction === "OK") { that._insertImportedRows(result); }
                }
              }
            );
            return;
          }

          this._insertImportedRows(result);
        },

        _insertImportedRows: function (result) {
          var oTableModel = this.getView().getModel("tableData");
          var aRows = oTableModel.getProperty("/rows");

          for (var i = result.rows.length - 1; i >= 0; i--) {
            aRows.unshift(result.rows[i]);
          }
          oTableModel.setProperty("/rows", aRows);
          this._applyBaseFilter();

          var sMsg = result.rows.length + " row(s) imported from Excel.";
          if (result.skipped > 0) {
            sMsg += "\n" + result.skipped + " row(s) skipped (empty).";
          }
          MessageToast.show(sMsg);
        },

        /* ── End Import from Excel ─────────────────────────── */

        onDelete: function () {
          const oTable = this.byId("routesTable");
          const aItems = oTable.getSelectedItems();
          if (!aItems.length) { MessageToast.show("Select row(s) to delete"); return; }

          MessageBox.confirm("Delete selected row(s)?", {
            onClose: (sAction) => {
              if (sAction !== "OK") return;

              const oTableModel = this.getView().getModel("tableData");
              const aRows       = oTableModel.getProperty("/rows");

              aItems.forEach(oItem => {
                const oCtx = oItem.getBindingContext("tableData");
                if (!oCtx) return;
                const oRow = oCtx.getObject();
                const iIdx = aRows.indexOf(oRow);
                if (iIdx < 0) return;

                if (oRow._state === "new") {
                  aRows.splice(iIdx, 1);
                } else {
                  aRows[iIdx]._state     = "deleted";
                  aRows[iIdx].ActionType = "X";
                }
              });

              oTableModel.setProperty("/rows", aRows);
              this._applyBaseFilter();
              MessageToast.show("Marked for deletion — save to confirm.");
            },
          });
        },

        onSave: async function () {
          const oView         = this.getView();
          const oRequestModel = oView.getModel("request");
          const sReqId        = oRequestModel.getProperty("/ReqId");
          const sTitle        = oRequestModel.getProperty("/ReqTitle") || "";
          const sReason       = oRequestModel.getProperty("/Reason")   || "";

          // ── Frontend validation (mirrors ABAP validate_mandatory + validate_business) ──
          const oTableModelV = oView.getModel("tableData");
          const aAllRows     = oTableModelV.getProperty("/rows");
          const aErrors      = this._validateRows(aAllRows);
          oTableModelV.setProperty("/rows", aAllRows); // refresh valueState bindings

          if (aErrors.length > 0) {
            MessageBox.error(
              "Please fix the following errors before saving:\n\n" + aErrors.join("\n"),
              { title: "Validation Error" }
            );
            return;
          }
          // ─────────────────────────────────────────────────────────────────────────────

          oView.setBusy(true);
          try {
            const sCsrfToken = await this._fetchCsrfToken(
              this._getMmRouteServiceUrl() + "?sap-client=" + this._getSapClient()
            );
            if (!sCsrfToken) throw new Error("Cannot fetch CSRF token");

            const oTableModel = oView.getModel("tableData");
            const aRows       = oTableModel.getProperty("/rows");

            const sReqItemId = oRequestModel.getProperty("/ReqItemId") || "";
            const sConfId    = oRequestModel.getProperty("/ConfId")    || "";

            if (!sReqItemId) {
              oView.setBusy(false);
              MessageBox.error("Cannot save: Request item data could not be loaded from the server. Please refresh the page and try again.");
              return;
            }

            // Build lookup of original main table values (for OldXxx fields)
            const mOrig = {};
            this._aMainRows.forEach(r => { mOrig[r.ItemId] = r; });

            let iSaved = 0;

            for (const row of aRows) {

              // ── NEW row (ActionType = 'C') ──────────────────────────────
              if (row._state === "new") {
                const oCreated = await this._postAndActivateReqRow({
                  ReqId:       sReqId,
                  ReqItemId:   sReqItemId,
                  ConfId:      sConfId,
                  ActionType:  "C",
                  EnvId:       row.EnvId       || "",
                  PlantId:     row.PlantId     || "",
                  SendWh:      row.SendWh      || "",
                  ReceiveWh:   row.ReceiveWh   || "",
                  TransMode:   row.TransMode   || "",
                  IsAllowed:   !!row.IsAllowed,
                  InspectorId: row.InspectorId || "",
                  ChangeNote:  row.ChangeNote  || "",
                }, sCsrfToken);
                if (oCreated?.ItemId) {
                  row._state     = "new";       // keep 'new' badge (it's a req-only row)
                  row._reqItemId = { ReqId: oCreated.ReqId, ReqItemId: oCreated.ReqItemId, ItemId: oCreated.ItemId };
                  iSaved++;
                }
                continue;
              }

              // ── DELETED row (ActionType = 'X') ──────────────────────────
              if (row._state === "deleted") {
                if (!row._reqItemId) {
                  // First time — POST a 'X' delta row
                  const orig = mOrig[row.ItemId] || row;
                  await this._postAndActivateReqRow({
                    ReqId:        sReqId,
                    ReqItemId:    sReqItemId,
                    ConfId:       sConfId,
                    ActionType:   "X",
                    SourceItemId: row.ItemId,
                    EnvId:        row.EnvId       || "",
                    PlantId:      row.PlantId     || "",
                    SendWh:       row.SendWh      || "",
                    ReceiveWh:    row.ReceiveWh   || "",
                    TransMode:    row.TransMode   || "",
                    IsAllowed:    !!row.IsAllowed,
                    InspectorId:  row.InspectorId || "",
                    VersionNo:    row.VersionNo   || 0,
                    ChangeNote:   row.ChangeNote  || "",
                    OldEnvId:        orig.EnvId       || "",
                    OldPlantId:      orig.PlantId     || "",
                    OldSendWh:       orig.SendWh      || "",
                    OldReceiveWh:    orig.ReceiveWh   || "",
                    OldTransMode:    orig.TransMode   || "",
                    OldIsAllowed:    !!orig.IsAllowed,
                    OldVersionNo:    orig.VersionNo   || 0,
                    OldInspectorId:  orig.InspectorId || "",
                  }, sCsrfToken);
                  iSaved++;
                } else {
                  // Already a req row — Edit → change ActionType → Activate
                  await this._editPatchActivateReqRow(
                    row._reqItemId,
                    { ActionType: "X" },
                    sCsrfToken
                  );
                  iSaved++;
                }
                continue;
              }

              // ── UNCHANGED main row — check if user modified any field ───
              if (!row.ItemId) continue;
              const orig = mOrig[row.ItemId];
              if (!orig) continue;

              const bChanged =
                (row.PlantId     || "") !== (orig.PlantId     || "") ||
                (row.SendWh      || "") !== (orig.SendWh      || "") ||
                (row.ReceiveWh   || "") !== (orig.ReceiveWh   || "") ||
                (row.TransMode   || "") !== (orig.TransMode   || "") ||
                !!row.IsAllowed         !== !!orig.IsAllowed         ||
                (row.InspectorId || "") !== (orig.InspectorId || "") ||
                !!(row.ChangeNote || "").trim();

              if (!bChanged) continue;

              if (!row._reqItemId) {
                // First edit — POST new 'U' delta row
                const oCreated = await this._postAndActivateReqRow({
                  ReqId:        sReqId,
                  ReqItemId:    sReqItemId,
                  ConfId:       sConfId,
                  ActionType:   "U",
                  SourceItemId: row.ItemId,
                  EnvId:        row.EnvId       || "",
                  PlantId:      row.PlantId     || "",
                  SendWh:       row.SendWh      || "",
                  ReceiveWh:    row.ReceiveWh   || "",
                  TransMode:    row.TransMode   || "",
                  IsAllowed:    !!row.IsAllowed,
                  InspectorId:  row.InspectorId || "",
                  VersionNo:    orig.VersionNo  || 0,
                  ChangeNote:   row.ChangeNote  || "",
                  OldEnvId:        orig.EnvId       || "",
                  OldPlantId:      orig.PlantId     || "",
                  OldSendWh:       orig.SendWh      || "",
                  OldReceiveWh:    orig.ReceiveWh   || "",
                  OldTransMode:    orig.TransMode   || "",
                  OldIsAllowed:    !!orig.IsAllowed,
                  OldVersionNo:    orig.VersionNo   || 0,
                  OldInspectorId:  orig.InspectorId || "",
                }, sCsrfToken);
                if (oCreated?.ItemId) {
                  row._state     = "modified";
                  row._reqItemId = { ReqId: oCreated.ReqId, ReqItemId: oCreated.ReqItemId, ItemId: oCreated.ItemId };
                  row.ActionType = "U";
                  iSaved++;
                }
              } else {
                // Already a req row — Edit → PATCH new values → Activate
                await this._editPatchActivateReqRow(
                  row._reqItemId,
                  {
                    PlantId:     row.PlantId     || "",
                    SendWh:      row.SendWh      || "",
                    ReceiveWh:   row.ReceiveWh   || "",
                    TransMode:   row.TransMode   || "",
                    IsAllowed:   !!row.IsAllowed,
                    InspectorId: row.InspectorId || "",
                    ChangeNote:  row.ChangeNote  || "",
                  },
                  sCsrfToken
                );
                iSaved++;
              }
            }

            oTableModel.setProperty("/rows", aRows);
            if (sReqId) await this._patchRequestHeader(sReqId, sTitle, sReason);

            oView.getModel("ui").setProperty("/editMode", false);
            this._applyBaseFilter();
            MessageToast.show(iSaved > 0
              ? iSaved + " change(s) saved to request."
              : "No changes detected.");
          } catch (e) {
            console.error(e);
            MessageBox.error(e?.message || "Save failed");
          } finally {
            oView.setBusy(false);
          }
        },

        onRefresh: async function () {
          const sReqId = this.getView().getModel("request").getProperty("/ReqId");
          const sEnvId = this.getView().getModel("requestContext").getProperty("/EnvId") || "DEV";
          this.getView().setBusy(true);
          try {
            if (sReqId) {
              await this._loadMainTableWithOverlay(sEnvId, sReqId);
            } else {
              await this._loadMainTable(sEnvId);
            }
            this._applyBaseFilter();
            MessageToast.show("Refreshed");
          } catch (e) {
            MessageBox.error("Refresh failed");
          } finally {
            this.getView().setBusy(false);
          }
        },

        onSearch: function () {
          const oTable      = this.byId("routesTable");
          const oBinding    = oTable.getBinding("items");
          const oFilterData = this.getView().getModel("filter").getData();

          const aFilters = [];

          if (oFilterData.EnvId)
            aFilters.push(new Filter("EnvId", FilterOperator.Contains, oFilterData.EnvId));
          if (oFilterData.PlantId)
            aFilters.push(new Filter("PlantId", FilterOperator.Contains, oFilterData.PlantId));
          if (oFilterData.SendWh)
            aFilters.push(new Filter("SendWh", FilterOperator.Contains, oFilterData.SendWh));
          if (oFilterData.ReceiveWh)
            aFilters.push(new Filter("ReceiveWh", FilterOperator.Contains, oFilterData.ReceiveWh));
          if (oFilterData.TransMode)
            aFilters.push(new Filter("TransMode", FilterOperator.Contains, oFilterData.TransMode));
          if (oFilterData.InspectorId)
            aFilters.push(new Filter("InspectorId", FilterOperator.Contains, oFilterData.InspectorId));
          if (oFilterData.Allowed === "X")
            aFilters.push(new Filter("IsAllowed", FilterOperator.EQ, true));
          else if (oFilterData.Allowed === "false")
            aFilters.push(new Filter("IsAllowed", FilterOperator.EQ, false));

          const sSearch = this.byId("searchField").getValue();
          if (sSearch) {
            aFilters.push(new Filter({
              filters: [
                new Filter("EnvId",       FilterOperator.Contains, sSearch),
                new Filter("PlantId",     FilterOperator.Contains, sSearch),
                new Filter("SendWh",      FilterOperator.Contains, sSearch),
                new Filter("ReceiveWh",   FilterOperator.Contains, sSearch),
                new Filter("TransMode",   FilterOperator.Contains, sSearch),
                new Filter("InspectorId", FilterOperator.Contains, sSearch),
              ],
              and: false,
            }));
          }

          oBinding.filter(aFilters);
        },

        // ── Private helpers ──────────────────────────────────────────────

        /**
         * Validates non-deleted rows before save.
         * Writes _vs_* / _vs_*Text properties onto each row object so the view's
         * valueState bindings react immediately.
         * Returns an array of human-readable error strings; empty array = all valid.
         */
        _validateRows: function (aRows) {
          const aErrors  = [];
          const aFieldDef = this._aFieldDef || [];

          // Fallback: if field def not loaded yet, use hardcoded required fields
          const aRequired = aFieldDef.length > 0
            ? aFieldDef.filter(function (f) { return f.IsRequired; })
            : [
                { FieldName: "PLANT_ID",    FieldLabel: "Plant" },
                { FieldName: "SEND_WH",     FieldLabel: "Sending WH" },
                { FieldName: "RECEIVE_WH",  FieldLabel: "Receiving WH" },
                { FieldName: "TRANS_MODE",  FieldLabel: "Transport Mode" },
              ];

          aRows.forEach(function (row, iIdx) {
            // Clear all _vs_* states from previous run
            Object.keys(row).forEach(function (k) {
              if (k.startsWith("_vs_")) row[k] = "None";
            });

            const sRowNum = "Row " + (iIdx + 1);
            const sSend   = String(row.SendWh    ?? "").trim();
            const sRecv   = String(row.ReceiveWh ?? "").trim();

            // Dynamic required-field check driven by ZCONFFIELDDEF
            if (row._state !== "deleted") {
              aRequired.forEach(function (fieldDef) {
                const sJsKey = this._dbToPascal(fieldDef.FieldName);  // PLANT_ID → PlantId
                const sVsKey = "_vs_" + sJsKey;                        // → _vs_PlantId
                const sVal   = String(row[sJsKey] ?? "").trim();
                if (!sVal) {
                  row[sVsKey] = "Error";
                  aErrors.push(sRowNum + ": " + fieldDef.FieldLabel + " is required.");
                }
              }.bind(this));
            }

            // Business rule (mirrors ABAP validate_business): SendWh ≠ ReceiveWh
            if (row._state !== "deleted" && sSend && sRecv && sSend === sRecv) {
              row._vs_SendWh        = "Error";
              row._vs_SendWhText    = "Sending WH must differ from Receiving WH";
              row._vs_ReceiveWh     = "Error";
              row._vs_ReceiveWhText = "Receiving WH must differ from Sending WH";
              aErrors.push(sRowNum + ": Sending WH and Receiving WH must be different.");
            }
          }.bind(this));

          return aErrors;
        },

        _getMmRouteServiceUrl: function () {
          return "/sap/opu/odata4/sap/zui_mm_route_conf/srvd/sap/zsd_mm_route_conf/0001/";
        },

        /** Load DEV main table into JSONModel — no snapshot into req table */
        _loadMainTable: async function (sEnvId) {
          const sUrl =
            this._getMmRouteServiceUrl() +
            "MMRouteMain?$filter=EnvId eq '" + sEnvId + "'&$orderby=PlantId,SendWh" +
            "&sap-client=" + this._getSapClient();

          const oResp = await fetch(sUrl, {
            headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
            credentials: "include",
          });
          if (!oResp.ok) throw new Error("Cannot load MMRouteMain: " + oResp.status);

          const aRaw  = (await oResp.json()).value || [];
          const aRows = aRaw.map(r => ({
            ...r,
            ActionType: "",
            ChangeNote: "",
            _state:     "unchanged",
            _reqItemId: null,
          }));

          this._aMainRows = aRows.map(r => ({ ...r }));   // keep original for diff
          this.getView().getModel("tableData").setProperty("/rows", aRows);
        },

        /** Load main table + overlay with existing req rows for this request */
        _loadMainTableWithOverlay: async function (sEnvId, sReqId) {
          const sBase      = this._getMmRouteServiceUrl();
          const sSapClient = this._getSapClient();

          const [oMainResp, oReqResp] = await Promise.all([
            fetch(sBase + "MMRouteMain?$filter=EnvId eq '" + sEnvId + "'&$orderby=PlantId,SendWh&sap-client=" + sSapClient, {
              headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
              credentials: "include",
            }),
            fetch(sBase + "MMRouteConf?$filter=ReqId eq " + sReqId + "&$select=ItemId,ReqId,ReqItemId,SourceItemId,ActionType,EnvId,PlantId,SendWh,ReceiveWh,InspectorId,TransMode,IsAllowed,VersionNo,ChangeNote&sap-client=" + sSapClient, {
              headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
              credentials: "include",
            }),
          ]);

          const aMain = oMainResp.ok ? ((await oMainResp.json()).value || []) : [];
          const aReq  = oReqResp.ok  ? ((await oReqResp.json()).value  || []) : [];
          console.log("[MMRoute] aMain count:", aMain.length, "aReq count:", aReq.length);
          console.log("[MMRoute] aReq rows:", JSON.stringify(aReq.map(r => ({ ActionType: r.ActionType, SourceItemId: r.SourceItemId, ItemId: r.ItemId }))));
          console.log("[MMRoute] aMain ItemIds:", aMain.map(r => r.ItemId));

          // ABAP returns "00000000-0000-0000-0000-000000000000" for initial UUID fields,
          // not null. Treat that as "no source" (i.e. a CREATE row).
          const isBlankId = id => !id || id === "00000000-0000-0000-0000-000000000000";

          // Map: SourceItemId → req row (for U and X rows only)
          const mReq = {};
          aReq.forEach(r => { if (!isBlankId(r.SourceItemId)) mReq[r.SourceItemId] = r; });

          // Merge: main rows overlaid with any saved delta
          const aRows = aMain.map(mainRow => {
            const req = mReq[mainRow.ItemId];
            if (req) {
              return {
                ...req,
                _state:     req.ActionType === "X" ? "deleted" : "modified",
                _reqItemId: { ReqId: req.ReqId, ReqItemId: req.ReqItemId, ItemId: req.ItemId },
              };
            }
            return { ...mainRow, ActionType: "", ChangeNote: "", _state: "unchanged", _reqItemId: null };
          });

          // Append CREATE-only rows (SourceItemId blank or all-zeros)
          aReq.filter(r => isBlankId(r.SourceItemId)).forEach(r => {
            aRows.push({ ...r, _state: "new", _reqItemId: { ReqId: r.ReqId, ReqItemId: r.ReqItemId, ItemId: r.ItemId } });
          });

          // Append DELETE rows whose source no longer exists in MMRouteMain
          // (already promoted — row was removed from live table, but history must remain visible)
          const aMainIds = new Set(aMain.map(r => r.ItemId));
          aReq.filter(r => r.ActionType === "X" && !isBlankId(r.SourceItemId) && !aMainIds.has(r.SourceItemId))
            .forEach(r => {
              aRows.push({ ...r, _state: "deleted", _reqItemId: { ReqId: r.ReqId, ReqItemId: r.ReqItemId, ItemId: r.ItemId } });
            });

          this._aMainRows = aMain.map(r => ({ ...r }));
          this.getView().getModel("tableData").setProperty("/rows", aRows);
        },

        /** POST payload to MMRouteConf → draft, then call Activate → active entity */
        _postAndActivateReqRow: async function (oPayload, sCsrfToken) {
          const sBase      = this._getMmRouteServiceUrl();
          const sSapClient = this._getSapClient();
          const sNs        = "com.sap.gateway.srvd.zsd_mm_route_conf.v0001";
          const oHeaders   = {
            "Content-Type": "application/json",
            "X-CSRF-Token": sCsrfToken,
            "X-Requested-With": "XMLHttpRequest",
            Accept: "application/json",
          };

          // 1. POST → creates draft entity
          const oPostResp = await fetch(sBase + "MMRouteConf?sap-client=" + sSapClient, {
            method: "POST",
            headers: oHeaders,
            credentials: "include",
            body: JSON.stringify(oPayload),
          });
          if (!oPostResp.ok) {
            const oErr = await oPostResp.json().catch(() => ({}));
            throw new Error(oErr?.error?.message || "POST req row failed (" + oPostResp.status + ")");
          }
          const oDraft = await oPostResp.json();

          // 2. Activate draft → persists to zmmrouteconf_req as active entity
          // Key must include all 3 entity keys + IsActiveEntity (backend has composite key)
          const sDraftKey =
            "ReqId=" + oDraft.ReqId +
            ",ReqItemId=" + oDraft.ReqItemId +
            ",ItemId=" + oDraft.ItemId;
          const sActivateUrl =
            sBase + "MMRouteConf(" + sDraftKey + ",IsActiveEntity=false)/" +
            sNs + ".Activate?sap-client=" + sSapClient;
          const oActResp = await fetch(sActivateUrl, {
            method: "POST",
            headers: oHeaders,
            credentials: "include",
            body: JSON.stringify({}),
          });
          if (!oActResp.ok) {
            const oActErr = await oActResp.json().catch(() => ({}));
            throw new Error(this._extractODataError(oActErr) || "Activate failed (" + oActResp.status + ")");
          }
          return oActResp.json();
        },

        /** Edit (create draft) → PATCH draft → Activate
         *  @param {object} oKeys  { ReqId, ReqItemId, ItemId } of the active entity
         */
        _editPatchActivateReqRow: async function (oKeys, oPayload, sCsrfToken) {
          const sBase      = this._getMmRouteServiceUrl();
          const sSapClient = this._getSapClient();
          const sNs        = "com.sap.gateway.srvd.zsd_mm_route_conf.v0001";
          const oHeaders   = {
            "Content-Type": "application/json",
            "X-CSRF-Token": sCsrfToken,
            "X-Requested-With": "XMLHttpRequest",
            Accept: "application/json",
          };

          // Build active entity key predicate (composite key)
          const sActiveKey =
            "ReqId=" + oKeys.ReqId +
            ",ReqItemId=" + oKeys.ReqItemId +
            ",ItemId=" + oKeys.ItemId;

          // 1. Edit → create draft from active entity
          const sEditUrl =
            sBase + "MMRouteConf(" + sActiveKey + ",IsActiveEntity=true)/" +
            sNs + ".Edit?sap-client=" + sSapClient;
          const oEditResp = await fetch(sEditUrl, {
            method: "POST",
            headers: oHeaders,
            credentials: "include",
            body: JSON.stringify({ PreserveChanges: false }),
          });
          if (!oEditResp.ok) {
            const oErr = await oEditResp.json().catch(() => ({}));
            throw new Error(oErr?.error?.message || "Edit action failed (" + oEditResp.status + ")");
          }
          const oDraft = await oEditResp.json();

          // Build draft key (use draft response, fall back to active keys)
          const sDraftKey =
            "ReqId=" + (oDraft.ReqId || oKeys.ReqId) +
            ",ReqItemId=" + (oDraft.ReqItemId || oKeys.ReqItemId) +
            ",ItemId=" + (oDraft.ItemId || oKeys.ItemId);

          // 2. PATCH draft with changed fields
          const sPatchUrl =
            sBase + "MMRouteConf(" + sDraftKey + ",IsActiveEntity=false)?sap-client=" + sSapClient;
          const oPatchResp = await fetch(sPatchUrl, {
            method: "PATCH",
            headers: oHeaders,
            credentials: "include",
            body: JSON.stringify(oPayload),
          });
          if (!oPatchResp.ok) {
            const oErr = await oPatchResp.json().catch(() => ({}));
            throw new Error(oErr?.error?.message || "PATCH draft failed (" + oPatchResp.status + ")");
          }

          // 3. Activate draft → updates active entity in zmmrouteconf_req
          const sActivateUrl =
            sBase + "MMRouteConf(" + sDraftKey + ",IsActiveEntity=false)/" +
            sNs + ".Activate?sap-client=" + sSapClient;
          const oActResp = await fetch(sActivateUrl, {
            method: "POST",
            headers: oHeaders,
            credentials: "include",
            body: JSON.stringify({}),
          });
          if (!oActResp.ok) {
            const oErr = await oActResp.json().catch(() => ({}));
            throw new Error(this._extractODataError(oErr) || "Activate failed (" + oActResp.status + ")");
          }
        },

        _applyBaseFilter: function () {
          const oBinding = this.byId("routesTable").getBinding("items");
          if (oBinding) oBinding.filter([]);
        },

        /** Map request status string → SAP UI5 ObjectStatus state */
        _statusToState: function (sStatus) {
          switch ((sStatus || "").toUpperCase()) {
            case "DRAFT":     return "Warning";
            case "SUBMITTED": return "Information";
            case "APPROVED":  return "Success";
            case "REJECTED":  return "Error";
            case "PROMOTED":  return "Success";
            default:          return "None";
          }
        },

        onClearFilters: function () {
          this.getView().getModel("filter").setData({
            EnvId: "", PlantId: "", SendWh: "", ReceiveWh: "",
            TransMode: "", Allowed: "", InspectorId: "", Search: "",
          });
          this.byId("searchField").setValue("");
          this._applyBaseFilter();
          MessageToast.show("Đã xóa bộ lọc");
        },

        // ── Value helps (filter panel) ────────────────────────────────────

        onValueHelpEnv: function () {
          if (!this._oEnvDialog) {
            this._oEnvDialog = new SelectDialog({
              title: "Select Environment",
              liveChange: function (oEvent) {
                const sValue = oEvent.getParameter("value");
                oEvent.getSource().getBinding("items").filter([
                  new Filter("EnvId", FilterOperator.Contains, sValue),
                ]);
              },
              search: function (oEvent) {
                const sValue = oEvent.getParameter("value");
                oEvent.getSource().getBinding("items").filter([
                  new Filter("EnvId", FilterOperator.Contains, sValue),
                ]);
              },
              confirm: (oEvent) => {
                const oSelected = oEvent.getParameter("selectedItem");
                if (oSelected) {
                  this.getView().getModel("filter").setProperty("/EnvId", oSelected.getTitle());
                }
              },
            });
            this._oEnvDialog.bindAggregation("items", {
              path: "/EnvDef",
              template: new StandardListItem({ title: "{EnvId}", description: "{Description}" }),
            });
            this.getView().addDependent(this._oEnvDialog);
          }
          this._oEnvDialog.open();
        },

        onValueHelpPlant: function () {
          if (!this._oPlantDialog) {
            this._oPlantDialog = new SelectDialog({
              title: "Select Plant",
              liveChange: function (oEvent) {
                const sValue = oEvent.getParameter("value");
                oEvent.getSource().getBinding("items").filter([
                  new Filter("PlantId", FilterOperator.Contains, sValue),
                ]);
              },
              search: function (oEvent) {
                const sValue = oEvent.getParameter("value");
                oEvent.getSource().getBinding("items").filter([
                  new Filter("PlantId", FilterOperator.Contains, sValue),
                ]);
              },
              confirm: (oEvent) => {
                const oSelected = oEvent.getParameter("selectedItem");
                if (oSelected) {
                  this.getView().getModel("filter").setProperty("/PlantId", oSelected.getTitle());
                }
              },
            });
            this._oPlantDialog.bindAggregation("items", {
              path: "/PlantUnit",
              template: new StandardListItem({ title: "{PlantId}", description: "{Description}" }),
            });
            this.getView().addDependent(this._oPlantDialog);
          }
          this._oPlantDialog.open();
        },

        // ── Value helps (table cell editing) — use getBindingContext("tableData") ──

        _setCellValue: function (sValue) {
          if (!this._oCellCtx) return;
          this._oCellCtx.getModel().setProperty(
            this._oCellCtx.getPath() + "/" + this._sCellField,
            sValue
          );
        },

        onValueHelpPlantCell: function (oEvent) {
          this._oCellCtx   = oEvent.getSource().getBindingContext("tableData");
          this._sCellField = "PlantId";
          if (!this._oPlantCellDialog) {
            this._oPlantCellDialog = new SelectDialog({
              title: "Select Plant",
              liveChange: function (oEv) {
                const sVal = oEv.getParameter("value");
                oEv.getSource().getBinding("items").filter([
                  new Filter("PlantId", FilterOperator.Contains, sVal),
                ]);
              },
              search: function (oEv) {
                const sVal = oEv.getParameter("value");
                oEv.getSource().getBinding("items").filter([
                  new Filter("PlantId", FilterOperator.Contains, sVal),
                ]);
              },
              confirm: (oEv) => {
                const oItem = oEv.getParameter("selectedItem");
                if (oItem) this._setCellValue(oItem.getTitle());
              },
            });
            this._oPlantCellDialog.bindAggregation("items", {
              path: "/PlantUnit",
              template: new StandardListItem({ title: "{PlantId}", description: "{Description}" }),
            });
            this.getView().addDependent(this._oPlantCellDialog);
          }
          this._oPlantCellDialog.open();
        },

        onValueHelpTransMode: function (oEvent) {
          this._oCellCtx   = oEvent.getSource().getBindingContext("tableData");
          this._sCellField = "TransMode";
          if (!this._oTransModeDialog) {
            this._oTransModeDialog = new SelectDialog({
              title: "Select Transport Mode",
              liveChange: function (oEv) {
                const sVal = oEv.getParameter("value");
                oEv.getSource().getBinding("items").filter([
                  new Filter("TransMode", FilterOperator.Contains, sVal),
                ]);
              },
              search: function (oEv) {
                const sVal = oEv.getParameter("value");
                oEv.getSource().getBinding("items").filter([
                  new Filter("TransMode", FilterOperator.Contains, sVal),
                ]);
              },
              confirm: (oEv) => {
                const oItem = oEv.getParameter("selectedItem");
                if (oItem) this._setCellValue(oItem.getTitle());
              },
            });
            this._oTransModeDialog.bindAggregation("items", {
              path: "/TransModeDef",
              template: new StandardListItem({ title: "{TransMode}", description: "{Description}" }),
            });
            this.getView().addDependent(this._oTransModeDialog);
          }
          this._oTransModeDialog.open();
        },

        onValueHelpSendWh: function (oEvent) {
          this._oCellCtx   = oEvent.getSource().getBindingContext("tableData");
          this._sCellField = "SendWh";
          this._openWhCellDialog();
        },

        onValueHelpRecvWh: function (oEvent) {
          this._oCellCtx   = oEvent.getSource().getBindingContext("tableData");
          this._sCellField = "ReceiveWh";
          this._openWhCellDialog();
        },

        _openWhCellDialog: function () {
          if (!this._oWhCellDialog) {
            this._oWhCellDialog = new SelectDialog({
              title: "Select Warehouse",
              liveChange: function (oEv) {
                const sVal = oEv.getParameter("value");
                oEv.getSource().getBinding("items").filter([
                  new Filter("WhId", FilterOperator.Contains, sVal),
                ]);
              },
              search: function (oEv) {
                const sVal = oEv.getParameter("value");
                oEv.getSource().getBinding("items").filter([
                  new Filter("WhId", FilterOperator.Contains, sVal),
                ]);
              },
              confirm: (oEv) => {
                const oItem = oEv.getParameter("selectedItem");
                if (oItem) this._setCellValue(oItem.getTitle());
              },
            });
            this._oWhCellDialog.bindAggregation("items", {
              path: "/WhDef",
              template: new StandardListItem({ title: "{WhId}" }),
            });
            this.getView().addDependent(this._oWhCellDialog);
          }
          this._oWhCellDialog.open();
        },

        onValueHelpInspector: function (oEvent) {
          this._oCellCtx   = oEvent.getSource().getBindingContext("tableData");
          this._sCellField = "InspectorId";
          if (!this._oInspectorDialog) {
            this._oInspectorDialog = new SelectDialog({
              title: "Select Inspector",
              liveChange: function (oEv) {
                const sVal = oEv.getParameter("value");
                oEv.getSource().getBinding("items").filter([new Filter({
                  filters: [
                    new Filter("UserId",   FilterOperator.Contains, sVal),
                    new Filter("Fullname", FilterOperator.Contains, sVal),
                  ],
                  and: false,
                })]);
              },
              search: function (oEv) {
                const sVal = oEv.getParameter("value");
                oEv.getSource().getBinding("items").filter([new Filter({
                  filters: [
                    new Filter("UserId",   FilterOperator.Contains, sVal),
                    new Filter("Fullname", FilterOperator.Contains, sVal),
                  ],
                  and: false,
                })]);
              },
              confirm: (oEv) => {
                const oItem = oEv.getParameter("selectedItem");
                if (oItem) this._setCellValue(oItem.getTitle());
              },
            });
            this._oInspectorDialog.bindAggregation("items", {
              path: "/InspectorDef",
              template: new StandardListItem({ title: "{UserId}", description: "{Fullname} ({RoleLevel})" }),
            });
            this.getView().addDependent(this._oInspectorDialog);
          }
          this._oInspectorDialog.open();
        },

      },
    );
  },
);
