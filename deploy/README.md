# Putting Trustbrick live on AWS

One EC2 server runs everything, in Docker:

```
 visitors ──► your domain (GoDaddy DNS) ──► Elastic IP ──► EC2 server (Ubuntu 24.04)
                                                     ├─ Caddy       HTTPS, certificates from Let's Encrypt
                                                     ├─ app         the website and the app's API (Next.js)
                                                     ├─ postgres    the database (PostGIS)
                                                     └─ stitcher    joins the app's 360° photos
 S3 bucket ◄── uploads (photos, videos, documents, tours) and nightly database backups
 Amazon SES ◄── emails (sign-up confirmation, password reset, notifications)
```

The server reaches S3 and SES through an **IAM role**, so no AWS keys are stored anywhere.

**Roughly what it costs** (Mumbai region; check the [AWS pricing calculator](https://calculator.aws/)):
- the server: t3.medium is about $30 a month, t3.large about $60;
- 40 GB of disk: about $4;
- the Elastic IP: about $4;
- S3 and SES: a few dollars at the start.

The domain is paid to GoDaddy.

Below, `trustbrick.in` stands for your domain. Replace it everywhere.

---

## 1. AWS account basics (once)

1. Sign in to the AWS console and pick the region **Asia Pacific (Mumbai) ap-south-1** (top right).
   Use it for everything below.
2. Secure the account:
   - Turn on **MFA** for the root user.
   - Create an IAM user with admin rights for daily use; don't use root.
3. Set up billing:
   - **Billing → Budgets → Create budget:** a monthly cost budget, for example $80, so you get an email before costs surprise you.

## 2. Storage bucket and the server's permissions

**S3 bucket** (S3 → Create bucket):
- Name it, for example, `trustbrick-media-<something-unique>`, in region ap-south-1.
- Leave **Block all public access** on. The site serves files itself after checking who may see them.
- Turn on **Bucket Versioning**, so a deleted or overwritten file can be recovered.

**IAM role for the server** (IAM → Roles → Create role):
1. Trusted entity: **AWS service → EC2**.
2. Skip the managed policies. After creating the role, open it and choose **Add permissions → Create inline policy → JSON**. Paste this, replacing the bucket name:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], "Resource": "arn:aws:s3:::trustbrick-media-CHANGE-ME/*" },
    { "Effect": "Allow", "Action": ["s3:ListBucket"], "Resource": "arn:aws:s3:::trustbrick-media-CHANGE-ME" },
    { "Effect": "Allow", "Action": ["ses:SendEmail", "ses:SendRawEmail"], "Resource": "*" }
  ]
}
```

3. Name the role `trustbrick-server`.

## 3. Launch the server

EC2 → **Launch instance**:

| Setting | Value |
| --- | --- |
| Name | `trustbrick` |
| Image | **Ubuntu Server 24.04 LTS** (64-bit x86) |
| Instance type | **t3.medium** (2 vCPU, 4 GB) to start; **t3.large** (8 GB) once it's busy |
| Key pair | **Create new key pair** → RSA, `.pem`. It downloads once: keep it safe (e.g. `C:\Users\you\.ssh\trustbrick.pem`) |
| Network → Security group | Create one: **SSH** from **My IP** only; **HTTP** and **HTTPS** from **Anywhere** |
| Storage | **40 GB gp3** |
| Advanced → IAM instance profile | **trustbrick-server** |
| Advanced → Termination protection | **Enable** |

Then attach a fixed address:
1. **EC2 → Elastic IPs → Allocate**.
2. **Actions → Associate** it with the `trustbrick` instance.
3. Note the IP: your domain will point to it.

## 4. Point the domain at the server (GoDaddy)

GoDaddy → **My Products → your domain → DNS**:

| Type | Name | Value | TTL |
| --- | --- | --- | --- |
| A | `@` | your Elastic IP | 600 |
| CNAME | `www` | `@` | 1 hour |

Remove GoDaddy's default **A @ "Parked"** record if there is one. Changes usually show within
minutes, sometimes an hour. Check from your PC:

```bash
nslookup trustbrick.in
```

It's ready when it answers with your Elastic IP.

## 5. Set up the server

Connect from your PC (PowerShell or Git Bash):

```bash
ssh -i C:\Users\you\.ssh\trustbrick.pem ubuntu@YOUR_ELASTIC_IP
```

**Get the code onto the server.** The repository is private, so give the server a read-only
deploy key. On the server:

```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519
cat ~/.ssh/id_ed25519.pub
```

1. Copy the printed line.
2. On GitHub: repository **Settings → Deploy keys → Add deploy key**. Paste it and leave write access off.
3. Back on the server:

```bash
git clone git@github.com:TBrealty/TrustBrick_Realty.git ~/trustbrick
cd ~/trustbrick
bash deploy/server-setup.sh
exit
```

`server-setup.sh` installs Docker, adds 4 GB of swap, turns on the firewall and automatic
security updates. Log out and back in afterwards.

## 6. Settings, then the first start

On the server:

```bash
cd ~/trustbrick/deploy
cp .env.example .env
nano .env
```

Fill in `.env`; the comments in it explain each line.
- **Secrets:** for each secret and password, run `openssl rand -base64 32 | tr -d '/+=' | head -c 40` and paste the result.
- **Storage:** `S3_BUCKET` is the bucket from step 2.
- **Email:** `EMAIL_FROM` is an address on your domain (step 7 verifies it).

Then start everything. **DNS from step 4 must already point here**, or Caddy can't get the HTTPS certificate:

```bash
bash deploy.sh
```

The first run takes several minutes. It builds the images, creates the database, applies the
migrations and loads the reference data (roles, property types, cities). Open
`https://trustbrick.in`: it should load with a padlock.

**Scheduled jobs** (pending push notifications, 360° photos, nightly backups):

```bash
mkdir -p ~/trustbrick/deploy/backups
sed "s|REPO|$HOME/trustbrick|g" ~/trustbrick/deploy/crontab | crontab -
```

## 7. Email (Amazon SES)

1. **SES → Identities → Create identity → Domain** → `trustbrick.in`, with **Easy DKIM** (RSA 2048).
2. SES shows **three CNAME records**. Add each in GoDaddy DNS, using the name without the `.trustbrick.in` ending. SES marks the domain *Verified* once they're seen.
3. Add a **TXT** record in GoDaddy: name `_dmarc`, value `v=DMARC1; p=none; rua=mailto:you@yourmail.com`.
4. New SES accounts are in a **sandbox**: they can only send to addresses you've verified.
   - While waiting, verify your own address under **Identities → Create identity → Email address**.
   - Then **SES → Account dashboard → Request production access**: say it's transactional email (sign-up confirmation, password resets, booking and lead notifications), with no marketing. Approval usually takes about a day.

## 8. The first SuperAdmin

1. Sign up on the site with your own email and confirm it from the email.
2. On the server:

```bash
cd ~/trustbrick/deploy
docker compose run --rm tools npm run admin:bootstrap -- --email you@yourmail.com
```

Then sign in: the admin workspace is at `https://trustbrick.in/dashboard`.

---

## Updating the site

On your PC, commit and push to GitHub. Then on the server:

```bash
cd ~/trustbrick && bash deploy/deploy.sh
```

It pulls the code, rebuilds, migrates the database and restarts. The site is down for a few
seconds while the new version starts.

## Day to day

| To… | Run (in `~/trustbrick/deploy`) |
| --- | --- |
| See what's running | `docker compose ps` |
| Read the site's logs | `docker compose logs -f --tail=200 app` |
| Restart the site | `docker compose restart app` |
| Open the database | `docker compose exec postgres psql -U postgres -d trustbrick` |
| Back up now | `bash backup.sh` |

## Backups

- **Database:** nightly at 02:30 IST, to `s3://BACKUP_S3_BUCKET/db-backups/`. The server also keeps the last 7 in `deploy/backups/`.
- **Restore** a dump into the running database (careful: this overwrites the data):

```bash
gunzip -c backups/trustbrick-YYYYMMDD-HHMMSS.sql.gz | docker compose exec -T postgres psql -U postgres -d trustbrick
```

- **Whole server:** EC2 → **Lifecycle Manager** → create a daily EBS snapshot policy for the instance's volume, keeping 7.
- **Uploads** are in S3 with versioning, so they survive even if the server doesn't.

## The phone app

Once the site is live, build the app against it. Set `EXPO_PUBLIC_API_URL=https://trustbrick.in` for the
EAS build (mobile/README.md → Building). With that set, the app no longer needs the cable.

## When something's wrong

| Problem | Check |
| --- | --- |
| Browser warns about the certificate | DNS doesn't point here yet (`nslookup`), or ports 80/443 aren't open in the security group. Then `docker compose logs caddy` |
| The site doesn't load | `docker compose ps`, then `docker compose logs --tail=200 app` |
| Confirmation emails don't arrive | `docker compose logs app \| grep email`. In the SES sandbox, only verified addresses receive mail |
| Build stops with "killed" | Not enough memory: check swap is on (`swapon --show`), or move to t3.large |
| Uploads fail | `S3_BUCKET` and `S3_REGION` in `.env`, and the IAM role is attached to the instance |
