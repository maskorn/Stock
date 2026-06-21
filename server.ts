import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Self-ping keeping-alive mechanism to prevent Render's Free Tier from spinning down (which happens after 15 mins of inactivity)
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL;
if (RENDER_EXTERNAL_URL) {
  const pingInterval = 14 * 60 * 1000; // 14 minutes
  console.log(`[Keep-Alive] Render environment detected. Scheduled self-ping every 14 minutes to: ${RENDER_EXTERNAL_URL}`);
  setInterval(async () => {
    try {
      const baseUrl = RENDER_EXTERNAL_URL.endsWith("/") ? RENDER_EXTERNAL_URL : `${RENDER_EXTERNAL_URL}/`;
      // Fetching home page to register active incoming traffic
      const response = await fetch(baseUrl);
      console.log(`[Keep-Alive] Self-pinged successfully at ${new Date().toISOString()}. Status code: ${response.status}`);
    } catch (err: any) {
      console.warn(`[Keep-Alive] Scheduled self-ping failed:`, err.message || err);
    }
  }, pingInterval);
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Increase request size limit for base64 images uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Handle body-parser payload-too-large or syntax errors as JSON instead of HTML
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction): any => {
  if (err && err.type === "entity.too.large") {
    return res.status(413).json({ 
      error: "您上传的单据文件/图像数据过大（限制 50MB），请尝试等候几秒重新操作或让客户端先压缩图像。" 
    });
  }
  if (err instanceof SyntaxError && "status" in err && (err as any).status === 400 && "body" in err) {
    return res.status(400).json({ error: "服务器收到了非法的 JSON 数据请求，解析失败。" });
  }
  next(err);
});

// Helper to secure Gemini initialization
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not configured in Secrets.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// Receipt OCR Parsing Endpoint using Gemini 3.5 Flash
app.post("/api/parse-receipt", async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64 || !mimeType) {
      return res.status(400).json({ error: "Missing imageBase64 or mimeType representation." });
    }

    const ai = getGeminiClient();

    const imagePart = {
      inlineData: {
        mimeType: mimeType,
        data: imageBase64
      }
    };

    const promptText = {
      text: `Please analyze and parse this input document (北新建材物料验收入库单, inventory voucher, or purchase invoice).
      CRITICAL INSTRUCTION FOR MULTI-PAGE/MULTI-VOUCHER DOCUMENTS:
      This PDF or image may contain multiple distinct receipts merged into a single file (for instance, Page 1 is one invoice, Page 2 is another invoice with a different number, Page 3 is another).
      Please parse EACH distinct receipt independently. Return a list where each element represents one distinct receipt with its own identifier, date, vendor, and private item rows.
      
      For each receipt, detect:
      - 业务日期 or 验收日期 as the date (YYYY-MM-DD format, e.g. 2026-03-04)
      - 供应商 as the supplier (e.g. PST COMMERCIAL COMPANY LIMITED)
      - 编号 or 单号 as the receiptNumber (e.g. AP05005260300003)
      - Table list items: 物料编码 (code), 物料名称 (name), 规格型号 (specification), 单位 (unit), 数量 (quantity), 不含税单价 (unitPrice), and 不含税金额 (totalPrice) for each item.
      Be extremely precise about codes (物料编码, which is usually a long digit sequence like 6025AD000000329). Convert figures to proper float or integers. Output in Simplified Chinese.`
    };

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: {
        parts: [imagePart, promptText]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            receipts: {
              type: Type.ARRAY,
              description: "The list of distinct parsed receipts detected within the uploaded file/images.",
              items: {
                type: Type.OBJECT,
                properties: {
                  receiptNumber: {
                    type: Type.STRING,
                    description: "票据单号、入库单号或编号（如 AP05005260300003）。"
                  },
                  date: {
                    type: Type.STRING,
                    description: "业务日期或验收日期，格式为 YYYY-MM-DD。"
                  },
                  supplier: {
                    type: Type.STRING,
                    description: "供应商名称（如 PST COMMERCIAL COMPANY LIMITED）。"
                  },
                  items: {
                    type: Type.ARRAY,
                    description: "入库物品明细列表。",
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        code: {
                          type: Type.STRING,
                          description: "物料编码（如 6025AD000000329）。若单据中无物料编码，请务必返回空字符串 \"\"，绝对不要编造或误填其他数据。"
                        },
                        name: {
                          type: Type.STRING,
                          description: "货物名称或商品名称（如 平板拖把）。"
                        },
                        specification: {
                          type: Type.STRING,
                          description: "规格、型号、品牌或尺寸（如 带桶 / 60cm）。若无，返回空字符串 \"\"。"
                        },
                        quantity: {
                          type: Type.NUMBER,
                          description: "数量。若无，返回 1。"
                        },
                        unit: {
                          type: Type.STRING,
                          description: "单位，例如：把、套、对、箱。若无，返回空字符串 \"\"或\"件\"。"
                        },
                        unitPrice: {
                          type: Type.NUMBER,
                          description: "不含税单价。若无，返回 0。"
                        },
                        totalPrice: {
                          type: Type.NUMBER,
                          description: "不含税金额（即小计）。不包含税率，若无，返回 0。"
                        }
                      },
                      required: ["name"]
                    }
                  },
                  totalAmount: {
                    type: Type.NUMBER,
                    description: "单据整单合计不含税总额(元)。应该等于所有明细金额的总和。"
                  },
                  operator: {
                    type: Type.STRING,
                    description: "经办人、收料员、仓管员或采购员姓名。例如 '王梅兰'、'永清' 等。"
                  },
                  notes: {
                    type: Type.STRING,
                    description: "备注说明，或其他无法归类的额外信息。"
                  }
                },
                required: ["receiptNumber", "date", "supplier", "items", "totalAmount"]
              }
            }
          },
          required: ["receipts"]
        }
      }
    });

    const textOutput = response.text;
    if (!textOutput) {
      return res.status(500).json({ error: "Gemini did not return any parse content." });
    }

    const parsedData = JSON.parse(textOutput.trim());
    return res.json({ success: true, data: parsedData });
  } catch (error: any) {
    console.error("Error parsing receipt via Gemini:", error.message);
    return res.status(500).json({ error: error.message || "Failed to parse receipt with AI." });
  }
});

// Proxy Google Apps Script Web App requests to avoid browser CORS/IFrame restrictions
app.post("/api/proxy-apps-script", async (req, res) => {
  try {
    const { appsScriptUrl, spreadsheetId, sheetName, rows } = req.body;
    if (!appsScriptUrl || !rows) {
      return res.status(400).json({ error: "Missing appsScriptUrl or rows data." });
    }

    const payload = { spreadsheetId, sheetName, rows };
    
    // Server-side fetch avoids CORS preflight failures inside browser iframe sandbox
    const response = await fetch(appsScriptUrl.trim(), {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return res.status(response.status).json({ 
          error: "Google Apps Script 拒绝了访问 (HTTP 450/401/403)。\n\n原因: 您的 Google Apps Script 网页应用可能尚未将【谁可以访问 (Who has access)】设置为【任何人 (Anyone)】，或【执行为 (Execute as)】没有选择您的账号。\n\n解决方法:\n1. 打开您的 Google Apps Script 窗口。\n2. 点击右上角的 部署 (Deploy) -> 管理部署 (Manage deployments)。\n3. 点击铅笔图标进行编辑，确保：\n   - 「执行为」: 选择“我 (Me)”\n   - 「谁具有访问权限」: 必须选择“任何人 (Anyone)”\n4. 重要：在“版本 (Version)”一栏拉取选择【新版本 (New Version)】！\n5. 点击部署，并复制生成的以 /exec 结尾的新 URL 重新配置即可。"
        });
      }
      return res.status(response.status).json({ error: `Apps Script service returned HTTP ${response.status}` });
    }

    // Google Apps Script sometimes returns successfully but redirects or has error payload in text
    const text = await response.text();
    if (text.includes("accounts.google.com/ServiceLogin")) {
      return res.status(401).json({ 
        error: "Google Apps Script 请求被重定向到谷歌登录页面 (CORS 拒绝/401)。\n\n这说明您的 Google Apps Script 网页应用中，【谁具有访问权限】设置的不是【任何人 (Anyone)】。他人或未登录的机器无法无感追加数据。\n\n解决方法:\n1. 重新进入 Apps Script，点击 部署 -> 管理部署 -> 编辑。\n2. 确保「谁具有访问权限」设为「任何人 (Anyone)」。\n3. 在版本下拉菜单中，选择创建「新版本 (New Version)」（这一点至关重要，哪怕您未作代码修改）。\n4. 点击部署，更新您在本页面顶部的 Web App URL 链接。" 
      });
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { success: true, raw: text };
    }

    return res.json({ success: true, data: json });
  } catch (error: any) {
    console.error("Error proxying Apps Script call:", error.message);
    return res.status(500).json({ error: error.message || "Failed to contact Apps Script service." });
  }
});

// Proxy GET Google Sheets API values to bypass CORS and iframe sandboxing limits
app.post("/api/proxy-get-sheets", async (req, res) => {
  try {
    const { spreadsheetId, accessToken, sheetName } = req.body;
    if (!spreadsheetId || !accessToken) {
      return res.status(400).json({ error: "Missing spreadsheetId or accessToken." });
    }
    const range = sheetName ? `${sheetName}!A:L` : "Sheet1!A:L";
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    });
    
    if (!response.ok) {
      const errText = await response.text();
      let errorMsg = errText;
      try {
        const errJson = JSON.parse(errText);
        errorMsg = errJson.error?.message || errText;
      } catch {}
      return res.status(response.status).json({ error: errorMsg });
    }
    
    const data = await response.json();
    return res.json({ success: true, data });
  } catch (error: any) {
    console.error("Error proxying direct Sheets fetch:", error?.message);
    return res.status(500).json({ error: error.message || "Failed to fetch from Google Sheets." });
  }
});

// Proxy GET Apps Script values
app.post("/api/proxy-apps-script-get", async (req, res) => {
  try {
    const { appsScriptUrl, spreadsheetId, sheetName } = req.body;
    if (!appsScriptUrl) {
      return res.status(400).json({ error: "Missing appsScriptUrl." });
    }
    const url = new URL(appsScriptUrl.trim());
    if (spreadsheetId) {
      url.searchParams.append("spreadsheetId", spreadsheetId);
    }
    if (sheetName) {
      url.searchParams.append("sheetName", sheetName);
    }
    
    const response = await fetch(url.toString(), {
      method: "GET"
    });
    
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error(`Apps Script GET returned HTTP ${response.status}:`, errText);
      let errorDetail = `Apps Script service returned HTTP ${response.status}`;
      
      if (errText.includes("accounts.google.com/ServiceLogin")) {
        return res.status(401).json({ 
          error: "Google Apps Script 401 权限异常：未公开授权访问。\n\n这表明您的 Apps Script 网页应用【谁具有访问权限】未能成功设置为【任何人 (Anyone)】。他人或服务器后台在没有您谷歌账号登录态时无法获取该资源。" 
        });
      }
      
      if (errText.includes("doGet is not defined") || errText.includes("doGet")) {
        errorDetail += " (您的 Apps Script 代码中可能缺失最新版 doGet 函数定义，无法在前端展示云表格的数据流水。请复制配置面板中最新的完整代码覆盖并重新部署！)";
      } else if (errText.trim()) {
        const cleanText = errText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        errorDetail += `: ${cleanText.substring(0, 180)}`;
      }
      return res.status(response.status).json({ error: errorDetail });
    }
    
    const text = await response.text();
    if (text.includes("accounts.google.com/ServiceLogin")) {
      return res.status(401).json({ 
        error: "Google Apps Script 请求被重定向到谷歌登录页面 (CORS 拒绝/401)。请确保「谁具有访问权限」设为「任何人 (Anyone)」。" 
      });
    }
    
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { success: false, error: "Failed to parse JSON response from Apps Script: " + text };
    }
    return res.json(json);
  } catch (error: any) {
    console.error("Error proxying Apps Script GET call:", error?.message);
    return res.status(500).json({ error: error?.message || "Failed to fetch from Apps Script." });
  }
});

// Proxy Direct Google Sheets API requests to bypass iframe sandboxing limits
app.post("/api/proxy-direct-sheets", async (req, res) => {
  try {
    const { spreadsheetId, accessToken, values, range, startRowIndex, endRowIndex } = req.body;
    if (!spreadsheetId || !accessToken || !values) {
      return res.status(400).json({ error: "Missing spreadsheetId, accessToken, or values." });
    }

    const sheetTabRange = range || "Sheet1!A:M";
    const dIndex = sheetTabRange.indexOf("!");
    const sheetName = dIndex !== -1 ? sheetTabRange.substring(0, dIndex).replace(/^'|'$/g, "") : "Sheet1";

    if (startRowIndex && endRowIndex && Number(startRowIndex) > 0 && Number(endRowIndex) > 0) {
      // 1. Fetch spreadsheet metadata to get sheetId
      const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
      const metaResponse = await fetch(metaUrl, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`
        }
      });

      if (!metaResponse.ok) {
        throw new Error(`无法获取工作表配置：${await metaResponse.text()}`);
      }
      const metaData = await metaResponse.json();
      const foundSheet = metaData.sheets?.find(
        (s: any) => s.properties?.title === sheetName
      );

      if (!foundSheet) {
        throw new Error(`未能在当前工作簿中找到名为 [${sheetName}] 的工作表。`);
      }
      const sheetId = foundSheet.properties?.sheetId;
      const startIdx = Number(startRowIndex) - 1; // 0-based index
      const endIdx = Number(endRowIndex); // 0-based end index (exclusive)
      const newRowCount = values.length;

      // 2. Perform atomic batchUpdate to delete original rows and insert new empty rows at startIdx
      const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
      const batchUpdatePayload = {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheetId,
                dimension: "ROWS",
                startIndex: startIdx,
                endIndex: endIdx
              }
            }
          },
          {
            insertDimension: {
              range: {
                sheetId: sheetId,
                dimension: "ROWS",
                startIndex: startIdx,
                endIndex: startIdx + newRowCount
              },
              inheritFromBefore: true
            }
          }
        ]
      };

      const batchResponse = await fetch(updateUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(batchUpdatePayload)
      });

      if (!batchResponse.ok) {
        throw new Error(`批量更新工作表结构失败：${await batchResponse.text()}`);
      }

      // 3. Write new values to the inserted rows
      const targetWriteRange = `${sheetName}!A${startRowIndex}:L${Number(startRowIndex) + newRowCount - 1}`;
      const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(targetWriteRange)}?valueInputOption=USER_ENTERED`;
      const writeResponse = await fetch(writeUrl, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ values })
      });

      if (!writeResponse.ok) {
        throw new Error(`写入更新数据失败：${await writeResponse.text()}`);
      }

      // 4. Update border on the bottom of the edited receipt
      try {
        const targetRowIndex = Number(startRowIndex) + newRowCount - 2; // last row (0-based)
        if (targetRowIndex >= 0) {
          await fetch(updateUrl, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              requests: [
                {
                  updateBorders: {
                    range: {
                      sheetId: sheetId,
                      startRowIndex: targetRowIndex,
                      endRowIndex: targetRowIndex + 1,
                      startColumnIndex: 0,
                      endColumnIndex: 26
                    },
                    bottom: {
                      style: "SOLID_MEDIUM",
                      color: { red: 0.0, green: 0.0, blue: 0.0, alpha: 1.0 }
                    }
                  }
                }
              ]
            })
          });
        }
      } catch (borderErr: any) {
        console.error("Direct API bottom border formatting failed:", borderErr?.message);
      }

      return res.json({ success: true, updated: true, msg: "Successfully updated record in-place" });
    }

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetTabRange)}:append?valueInputOption=USER_ENTERED`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ values })
    });

    if (!response.ok) {
      const errText = await response.text();
      let errorMsg = errText;
      try {
        const errJson = JSON.parse(errText);
        errorMsg = errJson.error?.message || errText;
      } catch {}
      return res.status(response.status).json({ error: errorMsg || `Google Sheets API returned HTTP ${response.status}` });
    }

    const data = await response.json();

    // Attempt to automatically apply bottom border to the last row of the newly appended voucher
    const updatedRange = data.updates?.updatedRange;
    if (updatedRange && typeof updatedRange === "string") {
      try {
        const dIndex = updatedRange.lastIndexOf("!");
        if (dIndex !== -1) {
          const sheetPart = updatedRange.substring(0, dIndex);
          const rangePart = updatedRange.substring(dIndex + 1); // e.g. "A11:N12" or "A11"
          const cleanSheetName = sheetPart.replace(/^'|'$/g, "");
          
          // Match the last row number
          const match = rangePart.match(/\d+$/);
          if (match) {
            const endRow = parseInt(match[0], 10);
            
            // 1. Fetch spreadsheet metadata to find the sheetId
            const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
            const metaResponse = await fetch(metaUrl, {
              method: "GET",
              headers: {
                "Authorization": `Bearer ${accessToken}`
              }
            });
            
            if (metaResponse.ok) {
              const metaData = await metaResponse.json();
              const foundSheet = metaData.sheets?.find(
                (s: any) => s.properties?.title === cleanSheetName
              );
              
              if (foundSheet) {
                const sheetId = foundSheet.properties?.sheetId;
                const targetRowIndex = endRow - 1; // 0-based
                
                // 2. batchUpdate to set the bottom border (中灰色 slate-400: #94A3B8)
                const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
                await fetch(updateUrl, {
                  method: "POST",
                  headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                  },
                  body: JSON.stringify({
                    requests: [
                      {
                        updateBorders: {
                          range: {
                            sheetId: sheetId,
                            startRowIndex: targetRowIndex,
                            endRowIndex: targetRowIndex + 1,
                            startColumnIndex: 0,
                            endColumnIndex: 26 // Cover columns A to Z to adapt to shifted/custom structures
                          },
                          bottom: {
                            style: "SOLID_MEDIUM",
                            color: {
                              red: 0.0,
                              green: 0.0,
                              blue: 0.0,
                              alpha: 1.0
                            }
                          }
                        }
                      }
                    ]
                  })
                });
              }
            }
          }
        }
      } catch (borderErr: any) {
        console.error("Direct API bottom border formatting failed:", borderErr?.message);
      }
    }

    return res.json({ success: true, data });
  } catch (error: any) {
    console.error("Error proxying direct Sheets call:", error.message);
    return res.status(500).json({ error: error.message || "Failed to sync to Google Sheets." });
  }
});

// Final route level error-handler middleware for any API/backend crash
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction): any => {
  console.error("Uncaught API/Backend error:", err);
  if (res.headersSent) {
    return next(err);
  }
  return res.status(500).json({ error: err.message || "服务器内部运行遇到未知解析异常。" });
});

// Configure Vite integration or asset routing
async function initServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://0.0.0.0:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
}

initServer().catch((err) => {
  console.error("Failed to start custom server:", err);
});
