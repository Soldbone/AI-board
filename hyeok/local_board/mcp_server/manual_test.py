import asyncio
import json

from config import MissingConfigError, get_settings
from server import health_check, make_map_search_url, search_local_places


async def main() -> None:
    health_result = await health_check()
    map_url_result = await make_map_search_url("둔전역", "조용한 카페")

    print("[health_check]")
    print(json.dumps(health_result, ensure_ascii=False, indent=2))

    print("[make_map_search_url]")
    print(json.dumps(map_url_result, ensure_ascii=False, indent=2))

    try:
        get_settings()
    except MissingConfigError as exc:
        print("[search_local_places]")
        print(f"SKIPPED: {exc}")
        return

    search_result = await search_local_places("둔전역", "조용한 카페", 3)

    print("[search_local_places]")
    print(json.dumps(search_result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
