from py_vapid import Vapid
from cryptography.hazmat.primitives import serialization
import base64

vapid = Vapid()
vapid.generate_keys()

# Serialize public key
public_key = vapid.public_key.public_bytes(
    encoding=serialization.Encoding.X962,
    format=serialization.PublicFormat.UncompressedPoint
)

# Serialize private key
private_key = vapid.private_key.private_bytes(
    encoding=serialization.Encoding.DER,
    format=serialization.PrivateFormat.PKCS8,
    encryption_algorithm=serialization.NoEncryption()
)

# Encode to base64
encoded_public = base64.urlsafe_b64encode(public_key).rstrip(b'=').decode('utf-8')
encoded_private = base64.urlsafe_b64encode(private_key).rstrip(b'=').decode('utf-8')

print("VAPID_PUBLIC_KEY =", encoded_public)
print("VAPID_PRIVATE_KEY =", encoded_private)
