
import os
import re

files_to_update = [
    "frontend/src/components/ControlForm.tsx",
    "frontend/src/components/dashboard/RiskDrilldownModal.tsx",
    "frontend/src/components/RiskForm.tsx",
    "frontend/src/pages/ControlDetailPage.tsx",
    "frontend/src/pages/ControlForms.tsx",
    "frontend/src/pages/ControlsPage.tsx",
    "frontend/src/pages/DashboardPage.tsx",
    "frontend/src/pages/HeroPage.tsx",
    "frontend/src/pages/RiskDetailPage.tsx",
    "frontend/src/pages/RiskForms.tsx",
    "frontend/src/pages/RisksPage.tsx"
]

def update_file(filepath):
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        return

    with open(filepath, 'r') as f:
        content = f.read()

    # 1. Remove destructured mockUserId from useAuth()
    # Pattern: const { mockUserId } = useAuth(); -> remove line
    content = re.sub(r'^\s*const\s*{\s*mockUserId\s*}\s*=\s*useAuth\(\);\s*\n', '', content, flags=re.MULTILINE)
    
    # Remove unused import { useAuth }
    # Only remove if it's the only import?
    # Pattern: import { useAuth } from '@/contexts/AuthContext';
    content = re.sub(r'^\s*import\s*{\s*useAuth\s*}\s*from\s*[\'"].*contexts/AuthContext[\'"];\s*\n', '', content, flags=re.MULTILINE)

    # 2. Remove mockUserId passed as property in objects: { ..., mockUserId }
    content = re.sub(r',\s*mockUserId\s*(?=[,}])', '', content)
    content = re.sub(r'\s*mockUserId\s*,\s*', '', content)
    
    # 3. Remove mockUserId as dependency in hooks [..., mockUserId]
    # This might match the above object property regex too used in brackets?
    # Yes, [id, mockUserId] -> [id]
    
    # 4. Remove mockUserId passed as argument: function(..., mockUserId)
    # The API signatures were like (data, mockUserId). Now (data).
    # So call sites are like createRisk(data, mockUserId).
    # Regex: ,\s*mockUserId\s*\) -> )
    content = re.sub(r',\s*mockUserId\s*\)', ')', content)
    
    # 5. Remove mockUserId as FIRST argument: api.get(mockUserId, ...)
    # Regex: \(\s*mockUserId\s*,\s* -> (
    content = re.sub(r'\(\s*mockUserId\s*,\s*', '(', content)

    # 6. Remove mockUserId as ONLY argument: lookupApi.getUsers(mockUserId)
    # Regex: \(\s*mockUserId\s*\) -> ()
    content = re.sub(r'\(\s*mockUserId\s*\)', '()', content)

    # 7. HeroPage specific: setMockUserId
    if "HeroPage.tsx" in filepath:
        content = re.sub(r'^\s*const\s*{\s*setMockUserId\s*}\s*=\s*useAuth\(\);\s*\n', '', content, flags=re.MULTILINE)
        content = re.sub(r'setMockUserId\([^)]*\);?', '// Mock auth removed', content)

    with open(filepath, 'w') as f:
        f.write(content)
    print(f"Updated {filepath}")

for f in files_to_update:
    update_file(f)
