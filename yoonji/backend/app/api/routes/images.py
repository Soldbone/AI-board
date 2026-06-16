from typing import Annotated

from fastapi import APIRouter, File, Path, UploadFile, status

from app.api.deps import CurrentUser, DbSession
from app.schemas.image_schema import ImageResponse
from app.services import image_service


router = APIRouter(prefix="/images", tags=["images"])


@router.post(
    "",
    response_model=ImageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_image(
    db: DbSession,
    current_user: CurrentUser,
    file: Annotated[UploadFile, File(...)],
) -> ImageResponse:
    return await image_service.upload_image(
        db,
        file=file,
        current_user=current_user,
    )


@router.delete("/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_image(
    image_id: Annotated[int, Path(gt=0)],
    db: DbSession,
    current_user: CurrentUser,
) -> None:
    image_service.delete_image(
        db,
        image_id=image_id,
        current_user=current_user,
    )
