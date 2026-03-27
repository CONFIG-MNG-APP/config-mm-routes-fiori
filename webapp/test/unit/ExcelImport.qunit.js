sap.ui.define([
  "zgsp26/conf/mng/mmroutes/confmngfemmroutes/ext/main/ExcelImport"
], function (ExcelImport) {
  "use strict";

  QUnit.module("ExcelImport – parseBool");

  QUnit.test("truthy values return true", function (assert) {
    assert.strictEqual(ExcelImport.parseBool("Yes"), true, "'Yes'");
    assert.strictEqual(ExcelImport.parseBool("yes"), true, "'yes'");
    assert.strictEqual(ExcelImport.parseBool("TRUE"), true, "'TRUE'");
    assert.strictEqual(ExcelImport.parseBool("true"), true, "'true'");
    assert.strictEqual(ExcelImport.parseBool("X"), true, "'X'");
    assert.strictEqual(ExcelImport.parseBool("x"), true, "'x'");
    assert.strictEqual(ExcelImport.parseBool("1"), true, "'1'");
    assert.strictEqual(ExcelImport.parseBool("Y"), true, "'Y'");
    assert.strictEqual(ExcelImport.parseBool(1), true, "number 1");
    assert.strictEqual(ExcelImport.parseBool(true), true, "boolean true");
  });

  QUnit.test("falsy values return false", function (assert) {
    assert.strictEqual(ExcelImport.parseBool("No"), false, "'No'");
    assert.strictEqual(ExcelImport.parseBool("false"), false, "'false'");
    assert.strictEqual(ExcelImport.parseBool(""), false, "empty string");
    assert.strictEqual(ExcelImport.parseBool(null), false, "null");
    assert.strictEqual(ExcelImport.parseBool(undefined), false, "undefined");
    assert.strictEqual(ExcelImport.parseBool(0), false, "number 0");
    assert.strictEqual(ExcelImport.parseBool(false), false, "boolean false");
    assert.strictEqual(ExcelImport.parseBool("abc"), false, "random string");
  });

  QUnit.module("ExcelImport – mapHeaders");

  QUnit.test("maps known headers correctly", function (assert) {
    var result = ExcelImport.mapHeaders(["Plant", "SendWH", "RecvWH", "Transport", "Allowed", "Inspector", "ChangeNote"]);
    assert.strictEqual(result.mapped["Plant"], "PlantId");
    assert.strictEqual(result.mapped["SendWH"], "SendWh");
    assert.strictEqual(result.mapped["RecvWH"], "ReceiveWh");
    assert.strictEqual(result.mapped["Transport"], "TransMode");
    assert.strictEqual(result.mapped["Allowed"], "IsAllowed");
    assert.strictEqual(result.mapped["Inspector"], "InspectorId");
    assert.strictEqual(result.mapped["ChangeNote"], "ChangeNote");
    assert.strictEqual(result.unmapped.length, 0);
  });

  QUnit.test("maps alternative header names", function (assert) {
    var result = ExcelImport.mapHeaders(["PlantId", "Send WH", "Receive WH", "Trans_Mode", "IsAllowed", "InspectorId", "Change Note"]);
    assert.strictEqual(result.mapped["PlantId"], "PlantId");
    assert.strictEqual(result.mapped["Send WH"], "SendWh");
    assert.strictEqual(result.mapped["Receive WH"], "ReceiveWh");
    assert.strictEqual(result.mapped["Trans_Mode"], "TransMode");
    assert.strictEqual(result.mapped["IsAllowed"], "IsAllowed");
    assert.strictEqual(result.mapped["InspectorId"], "InspectorId");
    assert.strictEqual(result.mapped["Change Note"], "ChangeNote");
  });

  QUnit.test("reports unmapped headers", function (assert) {
    var result = ExcelImport.mapHeaders(["Plant", "UnknownCol", "FooBar"]);
    assert.strictEqual(Object.keys(result.mapped).length, 1);
    assert.deepEqual(result.unmapped, ["UnknownCol", "FooBar"]);
  });

  QUnit.module("ExcelImport – transformRow");

  QUnit.test("transforms a valid row", function (assert) {
    var mapping = { "Plant": "PlantId", "SendWH": "SendWh", "RecvWH": "ReceiveWh", "Transport": "TransMode", "Allowed": "IsAllowed" };
    var rawRow = { "Plant": "PL01", "SendWH": "WH-A01", "RecvWH": "WH-B02", "Transport": "TRUCK", "Allowed": "Yes" };
    var row = ExcelImport.transformRow(rawRow, mapping, "DEV");

    assert.strictEqual(row.PlantId, "PL01");
    assert.strictEqual(row.SendWh, "WH-A01");
    assert.strictEqual(row.ReceiveWh, "WH-B02");
    assert.strictEqual(row.TransMode, "TRUCK");
    assert.strictEqual(row.IsAllowed, true);
    assert.strictEqual(row.EnvId, "DEV");
    assert.strictEqual(row.ActionType, "C");
    assert.strictEqual(row._state, "new");
    assert.strictEqual(row._reqItemId, null);
    assert.strictEqual(row.ItemId, "");
    assert.strictEqual(row.VersionNo, 0);
  });

  QUnit.test("returns null for empty row", function (assert) {
    var mapping = { "Plant": "PlantId", "SendWH": "SendWh" };
    var rawRow = { "Plant": "", "SendWH": "" };
    var row = ExcelImport.transformRow(rawRow, mapping, "DEV");
    assert.strictEqual(row, null);
  });

  QUnit.test("uses provided EnvId", function (assert) {
    var mapping = { "Plant": "PlantId" };
    var rawRow = { "Plant": "PL01" };
    var row = ExcelImport.transformRow(rawRow, mapping, "QAS");
    assert.strictEqual(row.EnvId, "QAS");
  });

  QUnit.test("defaults EnvId to DEV", function (assert) {
    var mapping = { "Plant": "PlantId" };
    var rawRow = { "Plant": "PL01" };
    var row = ExcelImport.transformRow(rawRow, mapping, "");
    assert.strictEqual(row.EnvId, "DEV");
  });

  QUnit.module("ExcelImport – parseWorkbook");

  QUnit.test("returns error for empty workbook", function (assert) {
    var result = ExcelImport.parseWorkbook(null, "DEV");
    assert.strictEqual(result.rows.length, 0);
    assert.ok(result.errors.length > 0);
  });

  QUnit.test("returns error for workbook with no sheets", function (assert) {
    var result = ExcelImport.parseWorkbook({ SheetNames: [], Sheets: {} }, "DEV");
    assert.strictEqual(result.rows.length, 0);
    assert.ok(result.errors.length > 0);
  });

  QUnit.test("parses workbook with valid data (mock XLSX global)", function (assert) {
    // Mock the XLSX global for this test
    var origXLSX = window.XLSX;
    window.XLSX = {
      utils: {
        sheet_to_json: function () {
          return [
            { "Plant": "PL01", "SendWH": "WH-A", "RecvWH": "WH-B", "Transport": "VAN", "Allowed": "Yes" },
            { "Plant": "PL02", "SendWH": "WH-C", "RecvWH": "WH-D", "Transport": "TRUCK", "Allowed": "No" },
            { "Plant": "", "SendWH": "", "RecvWH": "", "Transport": "", "Allowed": "" }
          ];
        }
      }
    };

    var workbook = { SheetNames: ["Sheet1"], Sheets: { "Sheet1": {} } };
    var result = ExcelImport.parseWorkbook(workbook, "DEV");

    assert.strictEqual(result.rows.length, 2, "2 valid rows parsed");
    assert.strictEqual(result.skipped, 1, "1 empty row skipped");
    assert.strictEqual(result.rows[0].PlantId, "PL01");
    assert.strictEqual(result.rows[0].TransMode, "VAN");
    assert.strictEqual(result.rows[0].IsAllowed, true);
    assert.strictEqual(result.rows[1].PlantId, "PL02");
    assert.strictEqual(result.rows[1].IsAllowed, false);

    window.XLSX = origXLSX;
  });

  QUnit.test("returns error when no headers match", function (assert) {
    var origXLSX = window.XLSX;
    window.XLSX = {
      utils: {
        sheet_to_json: function () {
          return [{ "Foo": "bar", "Baz": "qux" }];
        }
      }
    };

    var workbook = { SheetNames: ["Sheet1"], Sheets: { "Sheet1": {} } };
    var result = ExcelImport.parseWorkbook(workbook, "DEV");

    assert.strictEqual(result.rows.length, 0);
    assert.ok(result.errors[0].indexOf("No recognizable column headers") !== -1);

    window.XLSX = origXLSX;
  });
});
