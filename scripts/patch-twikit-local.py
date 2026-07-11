#!/usr/bin/env python3
"""Apply local Twikit compatibility patches for the standalone experiment venv.

Patches only the local Hermes Twikit venv:
1. Support X's webpack module-id format for ondemand.s hash lookup.
2. Include User-Agent in GuestClient base headers when sending X-Client-Transaction-Id.
"""

from __future__ import annotations

from pathlib import Path

SITE = Path('/Users/openai/.hermes/venvs/twikit/lib/python3.11/site-packages/twikit')
TRANSACTION = SITE / 'x_client_transaction' / 'transaction.py'
GUEST_CLIENT = SITE / 'guest' / 'client.py'


def patch_transaction() -> list[str]:
    text = TRANSACTION.read_text()
    results: list[str] = []

    if 'ON_DEMAND_MODULE_REGEX' not in text:
        old = (
            'ON_DEMAND_FILE_REGEX = re.compile(\n'
            '    r"""[\'|\\\\\"]{1}ondemand\\\\.s[\'|\\\\\"]{1}:\\\\s*[\'|\\\\\"]{1}([\\\\w]*)[\'|\\\\\"]{1}""", flags=(re.VERBOSE | re.MULTILINE))\n'
        )
        new = old + (
            'ON_DEMAND_MODULE_REGEX = re.compile(\n'
            '    r""",(\\\\d+):[\\\\\"\']ondemand\\\\.s[\\\\\"\']""", flags=(re.VERBOSE | re.MULTILINE))\n'
            'ON_DEMAND_HASH_PATTERN = r\'\'\',{module_id}:[\\\\\\\\\"\']([0-9a-f]+)[\\\\\\\\\"\']\'\'\'\n'
        )
        if old not in text:
            raise SystemExit(f'ON_DEMAND_FILE_REGEX block not found in {TRANSACTION}')
        text = text.replace(old, new, 1)
        results.append('patched transaction constants')
    else:
        results.append('already patched transaction constants')

    if '\\w{1})' in text or 'w{1}\[' in text:
        text = text.replace('\\w{1}\\[', '\\w{1,2}\\[', 1)
        results.append('patched indices regex')
    elif '\\w{1,2}\\[' in text:
        results.append('already patched indices regex')
    else:
        raise SystemExit(f'INDICES_REGEX target not found in {TRANSACTION}')

    if 'on_demand_file_url = None' not in text:
        old_get = (
            '        on_demand_file = ON_DEMAND_FILE_REGEX.search(str(response))\n'
            '        if on_demand_file:\n'
            '            on_demand_file_url = f"https://abs.twimg.com/responsive-web/client-web/ondemand.s.{on_demand_file.group(1)}a.js"\n'
            '            on_demand_file_response = await session.request(method="GET", url=on_demand_file_url, headers=headers)\n'
            '            key_byte_indices_match = INDICES_REGEX.finditer(\n'
            '                str(on_demand_file_response.text))\n'
            '            for item in key_byte_indices_match:\n'
            '                key_byte_indices.append(item.group(2))\n'
        )
        new_get = (
            '        on_demand_file_url = None\n'
            '        on_demand_file = ON_DEMAND_FILE_REGEX.search(str(response))\n'
            '        if on_demand_file:\n'
            '            on_demand_file_url = f"https://abs.twimg.com/responsive-web/client-web/ondemand.s.{on_demand_file.group(1)}a.js"\n'
            '        else:\n'
            '            on_demand_module = ON_DEMAND_MODULE_REGEX.search(str(response))\n'
            '            if on_demand_module:\n'
            '                module_id = on_demand_module.group(1)\n'
            '                hash_match = re.search(ON_DEMAND_HASH_PATTERN.format(module_id=module_id), str(response))\n'
            '                if hash_match:\n'
            '                    on_demand_file_url = f"https://abs.twimg.com/responsive-web/client-web/ondemand.s.{hash_match.group(1)}a.js"\n'
            '        if on_demand_file_url:\n'
            '            on_demand_file_response = await session.request(method="GET", url=on_demand_file_url, headers=headers)\n'
            '            key_byte_indices_match = INDICES_REGEX.finditer(\n'
            '                str(on_demand_file_response.text))\n'
            '            for item in key_byte_indices_match:\n'
            '                key_byte_indices.append(item.group(2))\n'
        )
        if old_get not in text:
            raise SystemExit(f'get_indices target not found in {TRANSACTION}')
        text = text.replace(old_get, new_get, 1)
        results.append('patched get_indices')
    else:
        results.append('already patched get_indices')

    TRANSACTION.write_text(text)
    return results


def patch_guest_client() -> list[str]:
    text = GUEST_CLIENT.read_text()
    old = "            'Referer': f'https://{DOMAIN}',\n        }\n"
    new = "            'Referer': f'https://{DOMAIN}',\n            'User-Agent': self._user_agent,\n        }\n"
    if new in text:
        return ['already patched guest user-agent']
    if old not in text:
        raise SystemExit(f'guest header target not found in {GUEST_CLIENT}')
    GUEST_CLIENT.write_text(text.replace(old, new, 1))
    return ['patched guest user-agent']


def main() -> None:
    for result in patch_transaction() + patch_guest_client():
        print(result)


if __name__ == '__main__':
    main()
