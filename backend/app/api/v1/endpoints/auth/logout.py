from fastapi import APIRouter

router = APIRouter()


@router.post("/logout")
async def logout():
    """
    Logout endpoint (client-side token removal).

    Returns:
        Success message
    """
    return {"message": "Logged out successfully"}

