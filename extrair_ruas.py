import requests
import json
import time

def get_streets():
    print("Conectando ao servidor alternativo do Overpass...")
    # Usando o servidor LZ4 que costuma ser mais permissivo
    url = 'https://lz4.overpass-api.de/api/interpreter'
    query = """
    [out:json][timeout:90];
    area["name"="Tocantins"]["admin_level"="8"]->.city;
    (way(area.city)["highway"]["name"];);
    out body;
    """
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://overpass-turbo.eu/'
    }
    
    try:
        response = requests.post(url, data={'data': query}, headers=headers, timeout=90)
        if response.status_code == 200:
            data = response.json()
            streets = set()
            for element in data.get('elements', []):
                if 'tags' in element and 'name' in element['tags']:
                    streets.add(element['tags']['name'])
            return sorted(list(streets))
        else:
            print(f"Erro no servidor: {response.status_code}")
            return []
    except Exception as e:
        print(f"Erro de conexão: {e}")
        return []

if __name__ == "__main__":
    ruas = get_streets()
    if ruas:
        with open('update_streets_tocantins.sql', 'w', encoding='utf-8') as f:
            f.write("-- SQL Tocantins-MG Gerado via LZ4 Overpass\n")
            f.write("INSERT INTO public.delivery_zones (name, fee, category) VALUES \n")
            sql_lines = []
            for r in ruas:
                r_sql = r.replace("'", "''").lower()
                sql_lines.append(f"('{r_sql}', 2.00, 'urban')")
            f.write(",\n".join(sql_lines))
            f.write("\nON CONFLICT (name) DO UPDATE SET fee = EXCLUDED.fee;\n")
        print(f"Sucesso total! {len(ruas)} ruas extraídas.")
    else:
        print("Bloqueio persistente. Tentando última alternativa...")
