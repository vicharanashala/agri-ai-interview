const fs = require("fs");
const file =
"c:/ai-interview/agri-ai-interview/frontend/public/raise-ticket.html";
let data = fs.readFileSync(file, "utf8");
const style = `
<link href='https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap' rel='stylesheet'>
<style>
  body {
    font-family: 'Inter', sans-serif;
    background: #f4fbf7;
    margin: 0;
    padding: 40px 20px;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
  }

  #zohoSupportWebToCase {
    background: #ffffff;
    border-radius: 16px;
    box-shadow: 0 10px 25px -5px rgba(34, 197, 94, 0.1), 0 8px 10px -6px rgba(34, 197, 94, 0.05);
    padding: 30px;
    border: 1px solid #e2e8f0;
    width: 100%;
    max-width: 500px;
    box-sizing: border-box;
  }

  .zsFormClass {
    width: 100% !important;
  }

  .zsFontClass {
    font-family: 'Inter', sans-serif !important;
    font-size: 14px !important;
    color: #334155 !important;
  }

  #zohoSupportWebToCase td {
    padding: 8px 0;
    display: block;
    width: 100%;
    box-sizing: border-box;
  }

  #zohoSupportWebToCase textarea,
  #zohoSupportWebToCase input[type='text'],
  #zohoSupportWebToCase select {
    width: 100% !important;
    box-sizing: border-box;
    border: 1px solid #cbd5e1 !important;
    border-radius: 8px !important;
    padding: 10px 14px !important;
    font-size: 14px;
    transition: all 0.2s ease;
    background: #f8fafc;
  }

  #zohoSupportWebToCase textarea:focus,
  #zohoSupportWebToCase input[type='text']:focus,
  #zohoSupportWebToCase select:focus {
    border-color: #22c55e !important;
    outline: none;
    box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.15);
    background: #ffffff;
  }

  .manfieldbdr {
    border-left: 1px solid #cbd5e1 !important;
  }

  input[type='submit'] {
    background: #22c55e !important;
    color: white !important;
    border: none !important;
    padding: 12px 24px !important;
    border-radius: 8px !important;
    font-weight: 600 !important;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 4px 12px rgba(34, 197, 94, 0.25);
    width: 100%;
    margin-bottom: 10px;
  }

  input[type='submit']:hover {
    background: #16a34a !important;
    transform: translateY(-1px);
  }

  input[type='button'][value='Reset'] {
    background: #f1f5f9 !important;
    color: #64748b !important;
    border: 1px solid #cbd5e1 !important;
    padding: 12px 24px !important;
    border-radius: 8px !important;
    font-weight: 600 !important;
    cursor: pointer;
    transition: all 0.2s ease;
    width: 100%;
  }

  input[type='button'][value='Reset']:hover {
    background: #e2e8f0 !important;
    color: #334155 !important;
  }

  tr:first-child .zsFontClass strong {
    font-size: 24px;
    font-weight: 800;
    color: #0f2238;
    display: block;
    margin-bottom: 20px;
    text-align: center;
  }

  td[nowrap] {
    font-weight: 600 !important;
    color: #475569 !important;
    margin-bottom: 4px;
    display: block;
  }

  .wtcuploadfile {
    color: #22c55e !important;
    font-weight: 600;
    padding: 8px 16px;
    background: rgba(34, 197, 94, 0.08);
    border-radius: 8px;
    border: 1px dashed rgba(34, 197, 94, 0.4);
    display: inline-block;
    text-align: center;
  }

  .wtcuploadinput {
    margin-top: -30px !important;
    height: 35px;
    width: 100px !important;
  }

  .wb_FtCon {
    justify-content: center !important;
    margin-top: 20px;
    opacity: 0.7;
    font-size: 12px;
  }
</style>`;

if (!data.includes("https://fonts.googleapis.com/css2?family=Inter")) {
data = data.replace("</head>", style + "</head>");
fs.writeFileSync(file, data);
console.log("Styles injected successfully.");
} else {
console.log("Styles already exist.");
}