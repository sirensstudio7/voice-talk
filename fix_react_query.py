import os
import re

directory = '/Users/bene/Documents/benelabs/voice-talk/apps/admin-app/src/app/(dashboard)/'
client_files = []
for root, _, files in os.walk(directory):
    for f in files:
        if f.endswith('-page-client.tsx'):
            client_files.append(os.path.join(root, f))

def fix_imports(content):
    content = content.replace("@/components/ui", "@voicetalk/ui")
    content = content.replace("import { api", "import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';\nimport { createHttpClient } from '@voicetalk/api-client';\n//")
    content = content.replace("import { api,", "import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';\nimport { createHttpClient } from '@voicetalk/api-client';\nimport {")
    return content

for path in client_files:
    with open(path, 'r') as f:
        content = f.read()
    content = fix_imports(content)
    with open(path, 'w') as f:
        f.write(content)
