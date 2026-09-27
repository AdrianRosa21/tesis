#!/usr/bin/env python3
"""Generate a strong shared secret for the AURA proxy and FastAPI backend."""

import secrets


if __name__ == "__main__":
    print(secrets.token_urlsafe(48))
