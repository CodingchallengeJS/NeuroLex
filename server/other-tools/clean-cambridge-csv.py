import csv
import re
from pathlib import Path

ASSETS_DIR = Path(__file__).resolve().parent / ".." / "assets"

# Helper function to remove HTML tags and clean up spaces
def clean_html(raw_html):
    if not raw_html:
        return ""
    # Replace common block tags with spaces so words don't stick together
    text = re.sub(r'</?(div|br|p|td|tr)[^>]*>', ' ', raw_html)
    # Remove all remaining HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    # Clean up whitespace and HTML entities
    text = text.replace('&nbsp;', ' ').strip()
    text = re.sub(r'\s+', ' ', text)
    
    return text if text else ""

def process_csv(input_file, output_file):
    # Setup columns based on your request
    headers = ['id', 'word', 'pronounciation', 'english_meaning', 'vietnamese_meaning', 'synonyms', 'example']
    
    with open(input_file, mode='r', encoding='utf-8-sig') as infile, \
         open(output_file, mode='w', encoding='utf-8', newline='') as outfile:
        
        reader = csv.reader(infile)
        writer = csv.writer(outfile)
        writer.writerow(headers)
        
        for idx, row in enumerate(reader, start=1):
            if not row or not row[0].strip():
                continue
            
            word = clean_html(row[0])
            pronounciation = ""
            english_meaning = ""
            vietnamese_meaning = ""
            synonyms = ""
            example = ""

            # Detect which format the row is using
            # Format A uses column 3 for [sound:...] and column 4 for mixed meanings
            if len(row) > 3 and "[sound:" in row[3]:
                
                # Extract pronunciation
                if row[2] and '/' in row[2]:
                    pronounciation = row[2].strip()
                
                raw_meaning = row[4]
                
                # 1. Extract Vietnamese Meaning (Usually in blue font)
                vn_match = re.search(r"""<font color=["']?[^>]+["']?>\s*\(?(.*?)\)?\s*</font>""", raw_meaning, re.IGNORECASE)
                if vn_match:
                    vietnamese_meaning = vn_match.group(1).strip()
                    # Remove the Vietnamese part from the raw string
                    raw_meaning = raw_meaning.replace(vn_match.group(0), '')
                
                # 2. Extract Synonyms (e.g., "(synonym: unavoidable)")
                syn_match = re.search(r'\(synonym[s]?:\s*([^)]+)\)', raw_meaning, re.IGNORECASE)
                if syn_match:
                    synonyms = syn_match.group(1).strip()
                    # Remove the synonym part from the raw string
                    raw_meaning = raw_meaning.replace(syn_match.group(0), '')
                
                # 3. English Meaning is whatever is left after cleaning HTML
                english_meaning = clean_html(raw_meaning)
                
                # 4. Extract Example (Column 5)
                if len(row) > 5:
                    example = clean_html(row[5])

            # Detect Format B (The Idioms at the bottom of the file)
            # e.g., Word, Example, Eng Meaning, Viet Meaning
            elif len(row) >= 4 and not "[sound:" in row[2] and not "[sound:" in row[3]:
                example = clean_html(row[1])
                english_meaning = clean_html(row[2])
                if row[3].strip():
                    vietnamese_meaning = clean_html(row[3])
            
            # Formatting "null" strings for completely empty values
            pronounciation = pronounciation if pronounciation and pronounciation != "null" else ""
            vietnamese_meaning = vietnamese_meaning if vietnamese_meaning else ""
            
            # Write to output
            writer.writerow([
                idx, 
                word, 
                pronounciation, 
                english_meaning, 
                vietnamese_meaning, 
                synonyms, 
                example
            ])

# Reads assets/cambridge-ielts-advanced.csv, writes assets/cleaned_vocabulary.csv
# (which import_vocab4.js then loads into the database).
if __name__ == "__main__":
    process_csv(
        ASSETS_DIR / "cambridge-ielts-advanced.csv",
        ASSETS_DIR / "cleaned_vocabulary.csv",
    )