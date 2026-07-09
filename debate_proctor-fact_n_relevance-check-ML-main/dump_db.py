import json
from database import operations as db

def view_ai_database():
    print("📥 Connecting to Aadhaar Database...")
    conn = db.get_connection("aadhaar")
    
    try:
        cursor = conn.cursor()
        
        # 1. Fetch the pageid, title, url, AND the full text content
        print("⏳ Fetching full text for all articles... This might take a second.")
        cursor.execute("SELECT pageid, title, url, content FROM raw_facts")
        full_rows = cursor.fetchall()
        
        # 2. Format it into a clean list of dictionaries
        export_data = [
            {
                "id": r[0], 
                "title": r[1], 
                "url": r[2], 
                "content": r[3]
            } 
            for r in full_rows
        ]
        
        # 3. Save it to a JSON file in your current folder
        output_filename = "aadhaar_database_dump.json"
        with open(output_filename, "w", encoding="utf-8") as f:
            json.dump(export_data, f, indent=4)
            
        print(f"\n✅ Success! {len(export_data)} articles fully exported.")
        print(f"💾 Open '{output_filename}' in your code editor to read the full text.")

    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    view_ai_database()