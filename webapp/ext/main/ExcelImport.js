sap.ui.define([], function () {
  "use strict";

  var HEADER_MAP = {
    "plant":          "PlantId",
    "plantid":        "PlantId",
    "plant_id":       "PlantId",
    "plant id":       "PlantId",
    "sendwh":         "SendWh",
    "send wh":        "SendWh",
    "send_wh":        "SendWh",
    "sending wh":     "SendWh",
    "recvwh":         "ReceiveWh",
    "recv wh":        "ReceiveWh",
    "receivewh":      "ReceiveWh",
    "receive wh":     "ReceiveWh",
    "receive_wh":     "ReceiveWh",
    "receiving wh":   "ReceiveWh",
    "transport":      "TransMode",
    "transmode":      "TransMode",
    "trans_mode":     "TransMode",
    "transport mode": "TransMode",
    "allowed":        "IsAllowed",
    "isallowed":      "IsAllowed",
    "is_allowed":     "IsAllowed",
    "inspector":      "InspectorId",
    "inspectorid":    "InspectorId",
    "inspector_id":   "InspectorId",
    "inspector id":   "InspectorId",
    "changenote":     "ChangeNote",
    "change note":    "ChangeNote",
    "change_note":    "ChangeNote",
    "note":           "ChangeNote"
  };

  var TRUTHY = ["yes", "true", "x", "1", "y"];

  var ExcelImport = {
    HEADER_MAP: HEADER_MAP,

    parseBool: function (val) {
      if (typeof val === "boolean") return val;
      if (typeof val === "number") return val === 1;
      if (!val) return false;
      return TRUTHY.indexOf(String(val).trim().toLowerCase()) !== -1;
    },

    mapHeaders: function (rawHeaders) {
      var mapped = {};
      var unmapped = [];
      rawHeaders.forEach(function (h) {
        var key = String(h).trim().toLowerCase();
        if (HEADER_MAP[key]) {
          mapped[h] = HEADER_MAP[key];
        } else {
          unmapped.push(h);
        }
      });
      return { mapped: mapped, unmapped: unmapped };
    },

    transformRow: function (rawRow, headerMapping, sEnvId) {
      var row = {
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
        _reqItemId:  null
      };

      var hasData = false;
      Object.keys(headerMapping).forEach(function (excelCol) {
        var modelField = headerMapping[excelCol];
        var val = rawRow[excelCol];
        if (val === undefined || val === null) return;

        if (modelField === "IsAllowed") {
          row.IsAllowed = ExcelImport.parseBool(val);
          hasData = true;
        } else {
          var sVal = String(val).trim();
          if (sVal) {
            row[modelField] = sVal;
            hasData = true;
          }
        }
      });

      return hasData ? row : null;
    },

    parseWorkbook: function (workbook, sEnvId) {
      if (!workbook || !workbook.SheetNames || !workbook.SheetNames.length) {
        return { rows: [], errors: ["No sheets found in workbook."], skipped: 0 };
      }

      var sheet = workbook.Sheets[workbook.SheetNames[0]];
      var rawData = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (!rawData.length) {
        return { rows: [], errors: ["The Excel file contains no data rows."], skipped: 0 };
      }

      var rawHeaders = Object.keys(rawData[0]);
      var headerResult = ExcelImport.mapHeaders(rawHeaders);

      if (!Object.keys(headerResult.mapped).length) {
        return {
          rows: [],
          errors: ["No recognizable column headers found. Expected: Plant, SendWH, RecvWH, Transport, Allowed, Inspector, ChangeNote"],
          skipped: rawData.length
        };
      }

      var rows = [];
      var errors = [];
      var skipped = 0;

      rawData.forEach(function (rawRow, idx) {
        var row = ExcelImport.transformRow(rawRow, headerResult.mapped, sEnvId);
        if (row) {
          rows.push(row);
        } else {
          skipped++;
          errors.push("Row " + (idx + 2) + ": all fields empty, skipped.");
        }
      });

      return { rows: rows, errors: errors, skipped: skipped };
    }
  };

  return ExcelImport;
});
