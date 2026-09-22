import os
import io
import httpx
from datetime import datetime
from fastapi import HTTPException
import openpyxl

MS_TENANT_ID = os.getenv("MS_TENANT_ID")
MS_CLIENT_ID = os.getenv("MS_CLIENT_ID")
MS_CLIENT_SECRET = os.getenv("MS_CLIENT_SECRET")
MS_DRIVE_ID = os.getenv("MS_DRIVE_ID")  # ID of the SharePoint/OneDrive drive to upload to

async def get_graph_token() -> str:
    """Acquires an app-only access token for Microsoft Graph."""
    if not all([MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET]):
        raise HTTPException(status_code=500, detail="Credenziali Microsoft Graph non configurate.")

    url = f"https://login.microsoftonline.com/{MS_TENANT_ID}/oauth2/v2.0/token"
    data = {
        "client_id": MS_CLIENT_ID,
        "client_secret": MS_CLIENT_SECRET,
        "scope": "https://graph.microsoft.com/.default",
        "grant_type": "client_credentials"
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(url, data=data)
        if response.status_code != 200:
            print(f"Error fetching token: {response.text}")
            raise HTTPException(status_code=500, detail="Errore di autenticazione con Microsoft Graph")
        return response.json()["access_token"]

async def upload_file_to_drive(file_content: bytes, file_name: str, folder_name: str) -> str:
    """
    Uploads a file to a specific folder in Microsoft Drive.
    folder_name can be the event name (e.g. "Assemblea Straordinaria").
    Returns the webUrl of the uploaded file.
    """
    if not MS_DRIVE_ID:
        raise HTTPException(status_code=500, detail="MS_DRIVE_ID non configurato.")

    token = await get_graph_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/octet-stream"
    }

    # API Endpoint per caricare un file in una cartella specifica.
    # Usa l'upload per file < 4MB (put content). Per le deleghe (di solito 1 pagina PDF) va bene.
    # Costruiamo il percorso: /cartella/file.pdf
    # Sostituiamo spazi e caratteri non validi per sicurezza
    safe_folder = folder_name.replace("/", "-").replace("\\", "-")
    safe_filename = file_name.replace("/", "-").replace("\\", "-")
    
    path = f"{safe_folder}/{safe_filename}"
    url = f"https://graph.microsoft.com/v1.0/drives/{MS_DRIVE_ID}/root:/{path}:/content"

    async with httpx.AsyncClient() as client:
        response = await client.put(url, headers=headers, content=file_content)
        
        if response.status_code not in (200, 201):
            print(f"Error uploading file: {response.text}")
            raise HTTPException(status_code=500, detail="Errore durante l'upload del file su Microsoft Drive")
            
        data = response.json()
        return data.get("webUrl", "")

async def create_and_upload_empty_excel(folder_name: str, file_name: str = "Raccolta_Dati.xlsx") -> str:
    """
    Creates an empty Excel file with headers and uploads it to the specified folder.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Raccolta Dati"
    headers = ["Nome", "Email", "Modalità", "Delegato", "Intolleranze", "Registrato Il"]
    ws.append(headers)
    
    for col in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col)
        cell.font = openpyxl.styles.Font(bold=True)
    
    output = io.BytesIO()
    wb.save(output)
    file_content = output.getvalue()
    
    return await upload_file_to_drive(file_content, file_name, folder_name)

async def append_to_excel_on_drive(folder_name: str, file_name: str, row_data: dict) -> bool:
    """
    Downloads an Excel file from OneDrive, appends or updates a row for the member, and uploads it back.
    If the Excel file does not exist yet on OneDrive (404), it creates it with bold headers and the first row.
    """
    if not MS_DRIVE_ID:
        return False
        
    token = await get_graph_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    safe_folder = folder_name.replace("/", "-").replace("\\", "-")
    safe_filename = file_name.replace("/", "-").replace("\\", "-")
    path = f"{safe_folder}/{safe_filename}"
    url = f"https://graph.microsoft.com/v1.0/drives/{MS_DRIVE_ID}/root:/{path}:/content"
    
    async with httpx.AsyncClient(follow_redirects=True) as client:
        res_get = await client.get(url, headers=headers)
        
        try:
            if res_get.status_code == 404:
                # File doesn't exist yet: initialize a new workbook
                wb = openpyxl.Workbook()
                ws = wb.active
                ws.title = "Raccolta Dati"
                header_cols = ["Nome", "Email", "Modalità", "Delegato", "Intolleranze", "Registrato Il"]
                ws.append(header_cols)
                for col_idx in range(1, len(header_cols) + 1):
                    ws.cell(row=1, column=col_idx).font = openpyxl.styles.Font(bold=True)
                
                # Append first entry
                ws.append([
                    row_data.get("nome", ""),
                    row_data.get("email", ""),
                    row_data.get("modalita", ""),
                    row_data.get("delega_a", ""),
                    row_data.get("intolleranze", ""),
                    datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                ])
            elif res_get.status_code == 200:
                # File exists: load and update/append
                existing_content = res_get.content
                wb = openpyxl.load_workbook(filename=io.BytesIO(existing_content))
                ws = wb.active
                
                email_to_match = (row_data.get("email") or "").strip().lower()
                row_found_idx = None
                
                # Check if this member is already in the sheet (column 2 is Email)
                for row_idx in range(2, ws.max_row + 1):
                    cell_val = ws.cell(row=row_idx, column=2).value
                    if cell_val and str(cell_val).strip().lower() == email_to_match:
                        row_found_idx = row_idx
                        break
                
                new_row_values = [
                    row_data.get("nome", ""),
                    row_data.get("email", ""),
                    row_data.get("modalita", ""),
                    row_data.get("delega_a", ""),
                    row_data.get("intolleranze", ""),
                    datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                ]
                
                if row_found_idx:
                    # Update existing row
                    for col_idx, val in enumerate(new_row_values, start=1):
                        ws.cell(row=row_found_idx, column=col_idx, value=val)
                else:
                    # Append new row
                    ws.append(new_row_values)
            else:
                print(f"Failed to fetch Excel file from OneDrive: HTTP {res_get.status_code} - {res_get.text}")
                return False

            # Auto-fit column widths slightly for readability
            for col in ws.columns:
                max_len = max(len(str(cell.value or '')) for cell in col)
                col_letter = openpyxl.utils.get_column_letter(col[0].column)
                ws.column_dimensions[col_letter].width = max(max_len + 3, 14)

            output = io.BytesIO()
            wb.save(output)
            new_content = output.getvalue()
        except Exception as e:
            print(f"Error preparing Excel file content: {e}")
            return False
            
        # Upload back to OneDrive
        headers["Content-Type"] = "application/octet-stream"
        res_put = await client.put(url, headers=headers, content=new_content)
        if res_put.status_code not in (200, 201):
            print(f"Failed to upload Excel file to OneDrive: {res_put.status_code} - {res_put.text}")
            return False
            
        return True

