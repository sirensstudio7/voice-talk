import re

with open('/Users/bene/Documents/benelabs/voice-talk/apps/admin-app/src/app/(dashboard)/[businessSlug]/menu/menu-page-client.tsx', 'r') as f:
    content = f.read()

# Replace loading and products state with query hook
content = re.sub(r'const \[products, setProducts\] = useState<Product\[\]>\(\[\]\);\n\s*const \[loading, setLoading\] = useState\(true\);\n\s*const \[saving, setSaving\] = useState\(false\);',
                 r'const { data: products = [], isLoading: loading, refetch } = useQuery({\n    queryKey: ["products", business?.id],\n    queryFn: async () => {\n      const http = createHttpClient({ baseUrl: API_URL, getToken: () => token });\n      const res = await http.get(`/admin/businesses/${business!.id}/products`);\n      return res as Product[];\n    },\n    enabled: !!business?.id && !!token,\n  });\n  const [saving, setSaving] = useState(false);', content)

# Remove the old load function and useEffect
content = re.sub(r'const load = async \(\) => {[\s\S]*?};\n\n\s*useEffect\(\(\) => {\n\s*void load\(\);\n\s*}, \[token, business\]\);', '', content)

# Replace await load() with refetch()
content = content.replace('await load();', 'await refetch();')

with open('/Users/bene/Documents/benelabs/voice-talk/apps/admin-app/src/app/(dashboard)/[businessSlug]/menu/menu-page-client.tsx', 'w') as f:
    f.write(content)
