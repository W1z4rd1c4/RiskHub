"""Client for AD Emulator integration."""
from typing import Any

import httpx

from app.core.config import get_settings


class ADEmulatorClient:
    """
    Client for interacting with the AD Emulator service.
    """

    def __init__(self):
        self.settings = get_settings()
        self.base_url = self.settings.ad_emulator_url.rstrip("/")

    async def get_users(self) -> list[dict[str, Any]]:
        """
        Fetch all users from the AD Emulator directory.

        Returns:
            list[dict]: List of user dictionaries from the emulator.

        Raises:
            httpx.HTTPStatusError: If the request fails.
            httpx.RequestError: If connection fails.
        """
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{self.base_url}/users/")
            response.raise_for_status()
            return response.json()
