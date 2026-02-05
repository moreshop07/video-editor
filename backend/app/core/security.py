from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db

# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain_password: str) -> str:
    """Return a bcrypt hash of *plain_password*."""
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Return ``True`` if *plain_password* matches *hashed_password*."""
    return pwd_context.verify(plain_password, hashed_password)


# ---------------------------------------------------------------------------
# JWT token helpers
# ---------------------------------------------------------------------------

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours


def create_access_token(
    user_id: int,
    *,
    expires_delta: timedelta | None = None,
) -> str:
    """Create a signed JWT containing the user's ID.

    Parameters
    ----------
    user_id:
        Primary key of the user row.
    expires_delta:
        Optional custom expiry. Defaults to ``ACCESS_TOKEN_EXPIRE_MINUTES``.

    Returns
    -------
    str
        An encoded JWT string.
    """
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))

    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> dict:
    """Decode and verify a JWT.

    Parameters
    ----------
    token:
        The raw JWT string.

    Returns
    -------
    dict
        The decoded payload with at least ``"sub"`` (user ID as string).

    Raises
    ------
    HTTPException (401)
        If the token is invalid, expired, or missing ``"sub"``.
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if payload.get("sub") is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject claim",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return payload


# ---------------------------------------------------------------------------
# FastAPI dependency – extract current user from Bearer token
# ---------------------------------------------------------------------------

bearer_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    """FastAPI dependency that validates the Bearer token and returns the user.

    Usage::

        @router.get("/me")
        async def me(user = Depends(get_current_user)):
            return user

    Returns
    -------
    User
        The SQLAlchemy ``User`` model instance for the authenticated user.

    Raises
    ------
    HTTPException (401)
        If the token is invalid or the user does not exist.
    """
    payload = verify_token(credentials.credentials)
    user_id = int(payload["sub"])

    # Late import to avoid circular dependency between models and core
    from app.models.user import User  # noqa: WPS433

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user
