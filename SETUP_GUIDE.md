# How to Host OpenClaw Platform Live — Complete Step-by-Step Guide

This guide is written in plain language. Follow it top to bottom. By the end, your platform will be live on the internet, accepting real users and payments.

---

## Table of Contents

1. [The Big Picture — What Are We Setting Up?](#1-the-big-picture)
2. [What You Need Before You Start (Accounts & Costs)](#2-what-you-need-before-you-start)
3. [Step 1 — Buy a Domain Name and Connect It to Cloudflare](#step-1--buy-a-domain-name-and-connect-it-to-cloudflare)
4. [Step 2 — Create Your Main Server on Hostinger](#step-2--create-your-main-server-on-hostinger)
5. [Step 3 — Connect Your Domain to Your Server (Cloudflare DNS)](#step-3--connect-your-domain-to-your-server-cloudflare-dns)
6. [Step 4 — Log Into Your Server and Install the Basics](#step-4--log-into-your-server-and-install-the-basics)
7. [Step 5 — Upload the Code to Your Server](#step-5--upload-the-code-to-your-server)
8. [Step 6 — Set Up PostgreSQL (Your Database)](#step-6--set-up-postgresql-your-database)
9. [Step 7 — Set Up Redis (Your Cache)](#step-7--set-up-redis-your-cache)
10. [Step 8 — Set Up Stripe (Payments)](#step-8--set-up-stripe-payments)
11. [Step 9 — Set Up Google Sign-In](#step-9--set-up-google-sign-in)
12. [Step 10 — Set Up AWS S3 (File Storage)](#step-10--set-up-aws-s3-file-storage)
13. [Step 11 — Set Up Resend (Emails)](#step-11--set-up-resend-emails)
14. [Step 12 — Get Your AI API Keys](#step-12--get-your-ai-api-keys)
15. [Step 13 — Set Up Hostinger API (Auto Server Creation)](#step-13--set-up-hostinger-api-auto-server-creation)
16. [Step 14 — Fill In Your Environment File](#step-14--fill-in-your-environment-file)
17. [Step 15 — Run the Database Migrations](#step-15--run-the-database-migrations)
18. [Step 16 — Build and Start the API](#step-16--build-and-start-the-api)
19. [Step 17 — Build and Start the Dashboard](#step-17--build-and-start-the-dashboard)
20. [Step 18 — Set Up Nginx (Makes Everything Public)](#step-18--set-up-nginx-makes-everything-public)
21. [Step 19 — Set Up SSL (HTTPS / The Padlock)](#step-19--set-up-ssl-https--the-padlock)
22. [Step 20 — Set Up Stripe Webhooks](#step-20--set-up-stripe-webhooks)
23. [Step 21 — Test Everything](#step-21--test-everything)
24. [Step 22 — Keep It Running Forever (Process Manager)](#step-22--keep-it-running-forever-process-manager)
25. [How Auto Server Creation Works](#how-auto-server-creation-works)
26. [Monthly Costs Breakdown](#monthly-costs-breakdown)
27. [Troubleshooting Common Problems](#troubleshooting)

---

## 1. The Big Picture

Here's what we're building in plain English:

```
Your users visit yourdomain.com
        │
        ▼
   CLOUDFLARE (free)
   Acts as a shield and speed boost:
   ├── Protects from attacks (DDoS protection)
   ├── Caches static files worldwide (CDN)
   ├── Provides free SSL (HTTPS padlock)
   └── Manages all DNS records
        │
        ▼
   MAIN SERVER (Hostinger VPS — you set this up once)
   This one machine runs:
   ├── Your website (the dashboard users see)
   ├── Your API (the brain that controls everything)
   ├── PostgreSQL (stores all your data — users, payments, etc.)
   └── Redis (speeds things up with caching)
        │
        ▼
   WORKER SERVERS (Hostinger VPS — created AUTOMATICALLY!)
   Each worker runs multiple user containers:
   ├── User A's AI agent (isolated Docker box)
   ├── User B's AI agent (isolated Docker box)
   └── User C's AI agent (isolated Docker box)
```

**Cloudflare** = sits in front of everything. Users hit Cloudflare first, then Cloudflare sends them to your server. It's free and adds security + speed.
**Main server** = one server you set up manually. It's the control center.
**Worker servers** = extra servers your platform creates automatically when you get more users. You don't touch these — they set themselves up.

---

## 2. What You Need Before You Start

### Accounts to Create (all free to start)

| # | Account | Where to Sign Up | What It's For | Free? |
|---|---------|-----------------|---------------|-------|
| 1 | Cloudflare | cloudflare.com | DNS management, DDoS protection, CDN | Yes |
| 2 | Hostinger | hostinger.com | Servers (main + workers) | No — VPS starts ~$5/mo |
| 3 | Stripe | stripe.com | Accepting payments | Yes (they take ~2.9% per transaction) |
| 4 | Google Cloud | console.cloud.google.com | "Sign in with Google" button | Yes |
| 5 | AWS | aws.amazon.com | Storing user files (S3) | Free tier for 12 months |
| 6 | Resend | resend.com | Sending emails to users | Free up to 3,000 emails/month |
| 7 | OpenAI | platform.openai.com | AI models (GPT-4, etc.) | Pay per use (~$0.15-$15 per 1M tokens) |
| 8 | Anthropic | console.anthropic.com | AI models (Claude) | Pay per use (~$3-$15 per 1M tokens) |
| 9 | Domain registrar | namecheap.com or any | Your domain name | ~$10/year |

**Why Cloudflare?** Cloudflare sits between your users and your server. It does three big things for free: (1) it makes your DNS changes take effect in seconds instead of hours, (2) it protects your server from DDoS attacks (someone flooding your site with fake traffic), and (3) it caches your static files on servers worldwide so your site loads faster for everyone. Every serious website uses Cloudflare or something like it. It's free.

### Tools You Need on Your Computer

- **A terminal app** — Terminal (Mac), Command Prompt or PowerShell (Windows), or any SSH client
- **A text editor** — You already have Cursor, that's perfect

### Estimated Startup Cost

| Item | Monthly Cost |
|------|-------------|
| Main server (Hostinger KVM2) | ~$10/mo |
| Domain name | ~$1/mo ($10/year) |
| AWS S3 | ~$0-2/mo (basically free at start) |
| AI API keys (OpenAI + Anthropic) | ~$5-50/mo depending on users |
| Resend emails | Free at start |
| **Total to launch** | **~$15-25/mo** |

---

## Step 1 — Buy a Domain Name and Connect It to Cloudflare

A domain is your address on the internet (like `myplatform.com`). We're going to buy one and then connect it to Cloudflare, which will manage all the DNS (the system that tells the internet where to find your website).

### 1a. Buy the Domain

1. Go to **namecheap.com** (or GoDaddy, Porkbun, Google Domains — wherever you prefer)
2. Search for the domain you want (e.g., `openclaw.io`, `myaibots.com`, whatever you like)
3. Buy it — usually around $10/year
4. **Write down your domain name.** We'll use `yourdomain.com` as a placeholder throughout this guide. Replace it everywhere with your actual domain.

### 1b. Create a Cloudflare Account

1. Go to **https://cloudflare.com** and click **Sign Up** (top right)
2. Enter your email and create a password
3. Confirm your email (they'll send you a verification link)

### 1c. Add Your Domain to Cloudflare

This is how you hand over DNS management from your registrar to Cloudflare.

1. Once logged into Cloudflare, click **"Add a site"** (or "Add site" on the dashboard)
2. Type your domain name (e.g., `yourdomain.com`) and click **"Add site"**
3. Choose the **Free plan** (scroll down — it's at the bottom) and click **"Continue"**
4. Cloudflare will scan your existing DNS records. Click **"Continue"** (don't worry about what it finds — we'll set up the correct records in Step 3)

### 1d. Change Your Domain's Nameservers to Cloudflare

This is the most important part. You're telling your domain registrar: "Cloudflare is in charge of DNS now."

1. Cloudflare will show you **two nameservers** that look something like:
   - `aria.ns.cloudflare.com`
   - `bob.ns.cloudflare.com`
   - (yours will be different — use the ones Cloudflare gives YOU)
2. **Copy both nameservers**
3. Now go to your **domain registrar** (Namecheap, GoDaddy, wherever you bought the domain)
4. Find your domain's settings and look for **"Nameservers"** or **"DNS"**
5. Change from "default nameservers" to **"Custom nameservers"**
6. Paste the two Cloudflare nameservers in
7. Save the changes

**What just happened?** You told the internet: "When someone asks where `yourdomain.com` is, ask Cloudflare." Cloudflare is now the boss of your domain's DNS. From now on, you'll manage ALL DNS records in Cloudflare, not in your registrar.

> **Note:** Nameserver changes can take up to 24 hours, but usually happen within 1-2 hours. Cloudflare will email you when it's active. You can keep going with the next steps while you wait.

### 1e. Configure Cloudflare Settings (While You Wait)

While you're in the Cloudflare dashboard:

1. Go to **SSL/TLS** (left sidebar) → set mode to **"Full (strict)"**
   - This means Cloudflare talks to your server securely too, not just to the user's browser
2. Go to **SSL/TLS** → **Edge Certificates** → make sure **"Always Use HTTPS"** is turned ON
3. Go to **Speed** → **Optimization** → turn on **"Auto Minify"** for JavaScript, CSS, and HTML (makes your site load faster)

---

## Step 2 — Create Your Main Server on Hostinger

This is the server that runs your website, API, and database. Think of it as the headquarters of your entire operation. Everything goes through this one machine.

**What is a VPS?** VPS stands for "Virtual Private Server." It's like renting a computer that lives in a data center and is always on, always connected to the internet. You don't physically touch it — you control it remotely from your laptop. It's different from "shared hosting" (where you share a server with hundreds of other websites and have limited control). With a VPS, you have full control — you can install anything, run any software, configure it however you want.

### 2a. Create a Hostinger Account

1. Go to **https://hostinger.com**
2. Click **"Sign Up"** or **"Get Started"**
3. Create your account with email + password (or use Google to sign up)
4. Add a payment method (credit card or PayPal)

### 2b. Buy a VPS

1. Once logged in, look in the top navigation or sidebar for **"VPS"** or **"VPS Hosting"**
   - **Important:** Do NOT click on "Web Hosting" or "WordPress Hosting" — those are shared hosting, not what you need
   - You specifically need **VPS** (Virtual Private Server)
2. You'll see different plans. Choose one:

| Plan | Specs | Best For | Price |
|------|-------|----------|-------|
| **KVM 2** | 2 CPU, 8GB RAM, 100GB disk | Starting out (up to ~50 users) | ~$10/mo |
| **KVM 4** | 4 CPU, 16GB RAM, 200GB disk | Growing (50-200 users) | ~$16/mo |
| **KVM 8** | 8 CPU, 32GB RAM, 400GB disk | Serious scale (200+ users) | ~$25/mo |

> **Recommendation:** Start with **KVM 2**. You can always upgrade later without losing anything. Don't overspend before you have users.

3. Click **"Add to Cart"** or **"Get"** on your chosen plan
4. Choose a billing period (monthly is fine to start, longer periods give bigger discounts)
5. Complete the purchase

### 2c. Set Up the VPS

After purchasing, Hostinger will walk you through the initial setup:

1. **Operating System:** Choose **Ubuntu 22.04** (64-bit)
   - If you see options like "Ubuntu 22.04 with control panel" — choose the one **without** a control panel (plain Ubuntu). You don't need cPanel or similar tools.
2. **Data center / Server location:** Pick the region closest to where most of your users will be:
   - Targeting North America → **US (East or West)**
   - Targeting Europe → **Netherlands, UK, or Lithuania**
   - Targeting Asia → **Singapore** or **India**
3. **Root password:** Create a strong password with at least 12 characters, including uppercase, lowercase, numbers, and symbols (e.g., `MyServer#2026!strong`). **Write this password down somewhere safe!** You will need it every time you log into the server.
4. **Hostname:** You can leave the default or type something like `openclaw-main`

### 2d. Find Your Server's IP Address

1. After setup completes (usually 1-2 minutes), go to your **Hostinger Dashboard**
2. Click on **VPS** in the sidebar
3. Click on your server
4. You'll see the server's **IP address** at the top — it looks like `123.45.67.89`
5. **Write this IP address down!** You'll use it everywhere.

You'll also see information like:
- Server status (should say "Running" with a green dot)
- Operating system (Ubuntu 22.04)
- CPU, RAM, and disk usage
- Your root username (`root`) and the password you set

---

## Step 3 — Connect Your Domain to Your Server (Cloudflare DNS)

Now we need to tell the internet: "When someone types `yourdomain.com`, send them to my Hostinger server." We do this by adding DNS records in Cloudflare.

**What is DNS?** DNS is like a phone book for the internet. When someone types `yourdomain.com` into their browser, DNS looks up the "phone number" (IP address) of your server and connects them. Without DNS records, nobody can find your website.

### 3a. Open Cloudflare DNS Settings

1. Log into **Cloudflare** (cloudflare.com)
2. Click on your domain in the dashboard
3. Click **"DNS"** in the left sidebar
4. You'll see a page called **"DNS Records"** — this is where we add our records

### 3b. Delete Old Records (if any)

If Cloudflare auto-imported any records from your registrar, delete them first:
- Look at the list of records. If there are any **A records** or **CNAME records** pointing to things you don't recognize, click the **three dots** (or "Edit") on each one and delete them
- It's okay to start with a clean slate

### 3c. Add Your DNS Records

Click **"+ Add record"** for each of the following. You'll add **4 records** total:

**Record 1: Main domain**
| Field | Value |
|-------|-------|
| Type | `A` |
| Name | `@` |
| IPv4 address | `YOUR_SERVER_IP` (e.g., `123.45.67.89`) |
| Proxy status | **Proxied** (orange cloud ON) |
| TTL | Auto |

Click **Save**.

**Record 2: www subdomain**
| Field | Value |
|-------|-------|
| Type | `A` |
| Name | `www` |
| IPv4 address | `YOUR_SERVER_IP` |
| Proxy status | **Proxied** (orange cloud ON) |
| TTL | Auto |

Click **Save**.

**Record 3: API subdomain**
| Field | Value |
|-------|-------|
| Type | `A` |
| Name | `api` |
| IPv4 address | `YOUR_SERVER_IP` |
| Proxy status | **Proxied** (orange cloud ON) |
| TTL | Auto |

Click **Save**.

**Record 4: Wildcard (for user containers)**
| Field | Value |
|-------|-------|
| Type | `A` |
| Name | `*` |
| IPv4 address | `YOUR_SERVER_IP` |
| Proxy status | **DNS only** (orange cloud OFF — grey cloud) |
| TTL | Auto |

Click **Save**.

### 3d. Understanding What You Just Did

| Record | What it does | Example |
|--------|-------------|---------|
| `@` | `yourdomain.com` → your server | User visits your landing page |
| `www` | `www.yourdomain.com` → your server | Same as above, with www |
| `api` | `api.yourdomain.com` → your server | Your dashboard talks to the API here |
| `*` | `anything.yourdomain.com` → your server | User containers like `john.yourdomain.com` |

**About the orange cloud (Proxy) vs grey cloud (DNS only):**
- **Orange cloud (Proxied):** Traffic goes through Cloudflare first. Cloudflare protects it from attacks, caches it, and hides your real server IP. Use this for your main site and API.
- **Grey cloud (DNS only):** Traffic goes directly to your server. Cloudflare just tells the browser where to go. We use this for the wildcard (`*`) because user containers on worker servers need direct connections for their SSL certificates to work.

### 3e. Verify DNS Is Working

DNS changes on Cloudflare are usually instant (that's one of the big advantages over regular DNS). But let's verify:

1. Go to **https://dnschecker.org**
2. Type your domain (e.g., `yourdomain.com`)
3. Select record type **A**
4. Click **Search**
5. You should see your server's IP address appearing across the world

If you see green checkmarks everywhere, your DNS is working. If some are still showing old values, wait 10-15 minutes and check again.

> **If Cloudflare shows "Pending Nameserver Update":** Your registrar hasn't switched to Cloudflare's nameservers yet. This can take up to 24 hours. DNS records you add now will work as soon as the nameservers switch over. Keep going with the rest of the setup — by the time you finish, it'll probably be done.

---

## Step 4 — Log Into Your Server and Install the Basics

Now we'll connect to your server remotely and install all the software it needs. This is the "setting up the kitchen before you can cook" step.

**What is SSH?** SSH (Secure Shell) is a way to remotely control a computer over the internet. You type commands on your laptop, but they actually run on the server. Think of it like a phone call to your server — you talk (type commands), it listens and responds.

### 4a. Connect to Your Server via SSH

**On Mac:**
1. Open the **Terminal** app (press `Cmd + Space`, type "Terminal", press Enter)
2. Type this command (replace `YOUR_SERVER_IP` with the actual IP from Step 2):

```bash
ssh root@YOUR_SERVER_IP
```

For example, if your IP is `143.42.78.123`, you'd type: `ssh root@143.42.78.123`

**On Windows:**
1. Open **PowerShell** (press `Windows key`, type "PowerShell", press Enter)
2. Type the same command: `ssh root@YOUR_SERVER_IP`
3. If that doesn't work, download **PuTTY** from putty.org, open it, paste your IP in the "Host Name" box, and click "Open"

**What happens next:**
- First time connecting, it will ask: `"Are you sure you want to continue connecting (yes/no)?"` — Type `yes` and press Enter
- It will ask for your password — type the root password you set in Step 2
- **The password won't show as you type** (no dots, no stars, nothing). This is normal! Just type it carefully and press Enter
- If you typed the password correctly, you'll see something like `root@openclaw-main:~#` — that means you're in!

**You're now inside your server.** From this point on, every command you type runs on the Hostinger server, not on your laptop. Your terminal is basically a remote control for the server now.

### 4b. Update the Server

First thing you always do on a fresh server — update all the existing software to the latest versions:

```bash
apt update && apt upgrade -y
```

**What this does:** `apt update` refreshes the list of available software. `apt upgrade -y` installs all updates. The `-y` means "yes to everything" so it doesn't keep asking you for permission.

This takes 1-3 minutes. If a purple/pink screen pops up asking about restarting services, just press **Enter** to accept the defaults. If it asks which services to restart, press **Enter** again.

### 4c. Install Node.js 20

Node.js is the engine that runs your API (the backend brain) and your dashboard (the website users see). Without it, none of your code can run.

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
```

**What this does:** The first line downloads a setup script from NodeSource (a trusted provider of Node.js packages). The second line actually installs Node.js and npm (the package manager that installs code libraries).

Verify it worked:
```bash
node -v
npm -v
```

You should see version numbers like `v20.x.x` and `10.x.x`. If you see "command not found" instead, the installation failed — try running the two commands again.

### 4d. Install Docker and Docker Compose

Docker is the technology that creates isolated "boxes" (containers) for each user's AI agent. Each user gets their own container that can't interfere with anyone else's. Docker Compose helps you run multiple containers together.

```bash
curl -fsSL https://get.docker.com | sh
apt install -y docker-compose
```

**What this does:** Downloads Docker's official install script and runs it. Then installs Docker Compose on top.

Verify both installed:
```bash
docker -v
docker-compose -v
```

You should see version numbers for both. If `docker -v` gives you an error, try logging out and back in: type `exit`, then `ssh root@YOUR_SERVER_IP` again.

### 4e. Install Other Tools

```bash
apt install -y git nginx certbot python3-certbot-nginx htop curl jq unzip
```

**What each tool does:**
- **git** — downloads your code from GitHub (or any code repository)
- **nginx** (pronounced "engine-x") — a "reverse proxy" that sits at the front door of your server and directs traffic. When someone visits `yourdomain.com`, Nginx sends them to the dashboard. When something hits `api.yourdomain.com`, Nginx sends it to the API. Think of it as a receptionist.
- **certbot** — automatically gets free SSL certificates from Let's Encrypt (this gives you the padlock icon in the browser bar — the "https://" part)
- **python3-certbot-nginx** — lets certbot automatically configure Nginx for SSL (so you don't have to do it manually)
- **htop** — a live monitoring tool that shows CPU, RAM, and process usage (like Task Manager on Windows)
- **curl** — downloads things from the internet via command line
- **jq** — formats JSON data nicely (useful for reading API responses)
- **unzip** — extracts .zip files

### 4f. Quick Sanity Check

Let's make sure everything is installed properly. Run this:

```bash
echo "Node: $(node -v)" && echo "npm: $(npm -v)" && echo "Docker: $(docker -v)" && echo "Nginx: $(nginx -v 2>&1)" && echo "Git: $(git --version)"
```

You should see version numbers for everything. If anything says "command not found", go back and re-run the install command for that tool.

---

## Step 5 — Upload the Code to Your Server

Right now, your project code lives on your laptop. The server is empty — it has no idea what OpenClaw is. We need to copy the code from your computer to the server.

You have two options. **Option A is recommended** if your code is on GitHub. **Option B** works if it's only on your laptop.

### Option A: Using Git (recommended)

**What is Git/GitHub?** Git is a version control tool (tracks changes to your code). GitHub is a website that stores your code online. If your code is on GitHub, the server can download it directly — no need to transfer files from your laptop.

**If your code is already on GitHub:**

```bash
cd /opt
git clone https://github.com/Skycustody/openclaw-platform
cd openclaw-platform
```

Replace `YOUR_USERNAME` with your actual GitHub username.

**If it's a private repository** (not public), GitHub will ask for authentication. The easiest way:
1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token
2. Give it `repo` access, generate it, copy the token
3. When Git asks for your password, paste the token instead of your GitHub password

### Option B: Upload Files from Your Laptop with SCP

**What is SCP?** SCP (Secure Copy) copies files from your computer to a remote server over an encrypted connection. It's like dragging a folder to a USB drive, except the "USB drive" is a server on the internet.

1. **Open a NEW terminal window on your Mac** (not the one connected to the server — a fresh one)
2. Run this command:

```bash
scp -r /Users/mac/Desktop/2.0/openclaw-platform root@YOUR_SERVER_IP:/opt/openclaw-platform
```

Replace `YOUR_SERVER_IP` with your actual server IP.

**What this does:** Copies the entire `openclaw-platform` folder from your Desktop to the `/opt/` directory on the server.

It will ask for your server password. Type it and press Enter. The transfer will take 1-5 minutes depending on your internet speed. You'll see files scrolling by as they upload.

3. Now switch back to your **server terminal** (the SSH session) and navigate to the code:

```bash
cd /opt/openclaw-platform
```

4. Verify the files are there:

```bash
ls
```

You should see folders like `api/`, `dashboard/`, `docker/`, `scripts/`, `migrations/`, and files like `package.json`, `.env.example`, etc.

### Install Dependencies

Now we need to install all the code libraries (packages) that the project depends on. Think of it like downloading all the ingredients before you start cooking.

```bash
cd /opt/openclaw-platform
npm install
```

**What this does:** Reads `package.json` (the recipe list) and downloads everything the project needs from the internet. This includes both the API's packages and the dashboard's packages (it's a "monorepo" — both live in one project).

This takes 2-5 minutes. You'll see a lot of text scrolling by — that's normal. Wait for it to finish. When you see your prompt (`root@...:#`) again, it's done.

If you see warnings (yellow text saying "WARN"), that's usually fine. If you see errors (red text saying "ERR"), something went wrong — read the error message carefully.

---

## Step 6 — Set Up PostgreSQL (Your Database)

PostgreSQL stores all your data — users, payments, settings, AI memories, everything.

### 6a. Start PostgreSQL with Docker

```bash
docker run -d \
  --name openclaw-postgres \
  --restart unless-stopped \
  -e POSTGRES_DB=openclaw \
  -e POSTGRES_USER=openclaw \
  -e POSTGRES_PASSWORD=ICK_A_STRONG_PASSWORD_HERE \
  -p 5432:5432 \
  -v pgdata:/var/lib/postgresql/data \
  pgvector/pgvector:pg16
```

**Important:** Replace `PICK_A_STRONG_PASSWORD_HERE` with an actual strong password. **Write it down** — you'll need it for the environment file later.

We're using `pgvector/pgvector:pg16` instead of plain PostgreSQL because it includes the "pgvector" extension, which your platform needs for AI memory features (storing and searching text embeddings).

### 6b. Verify It's Running

```bash
docker ps
```

You should see `openclaw-postgres` in the list with status "Up".

**Your database connection string will be:**
```
postgresql://openclaw:PICK_A_STRONG_PASSWORD_HERE@localhost:5432/openclaw
```

---

## Step 7 — Set Up Redis (Your Cache)

Redis is like a super-fast temporary notepad. It caches frequently accessed data so things load faster and handles job queues.

### 7a. Start Redis with Docker

```bash
docker run -d \
  --name openclaw-redis \
  --restart unless-stopped \
  -p 6379:6379 \
  -v redisdata:/data \
  redis:7-alpine
```

### 7b. Verify It's Running

```bash
docker ps
```

You should see `openclaw-redis` in the list.

**Your Redis connection string will be:**
```
redis://localhost:6379
```

---

## Step 8 — Set Up Stripe (Payments)

Stripe handles all the money — subscriptions, one-time purchases, invoices, refunds.

### 8a. Create a Stripe Account

1. Go to **stripe.com** and sign up
2. Complete your business verification (Stripe needs to know who you are before you can accept real money). This can take 1-2 days, but you can use "test mode" immediately.

### 8b. Get Your API Keys

1. Go to **https://dashboard.stripe.com/apikeys**
2. You'll see two keys:
   - **Publishable key** (`pk_live_...`) — not needed right now
   - **Secret key** (`sk_live_...`) — **copy this and save it**

> While testing, use the **test mode** keys (`sk_test_...`). Toggle "Test mode" in the top-right of the Stripe dashboard.

### 8c. Create Your Subscription Products

1. Go to **https://dashboard.stripe.com/products**
2. Click **"+ Add product"**
3. Create **three subscription products**:

**Product 1: Starter Plan**
- Name: `Starter`
- Price: `$10.00/month` (recurring)
- Click "Add product"
- Now click on the product, find the price, and **copy the Price ID** (starts with `price_...`)
- Save this as your `STRIPE_PRICE_STARTER`

**Product 2: Pro Plan**
- Name: `Pro`
- Price: `$25.00/month` (recurring)
- Copy the Price ID → this is your `STRIPE_PRICE_PRO`

**Product 3: Business Plan**
- Name: `Business`
- Price: `$50.00/month` (recurring)
- Copy the Price ID → this is your `STRIPE_PRICE_BUSINESS`

### 8d. Create Token Package Products

These are one-time purchases (not subscriptions) for users who want to buy extra AI tokens.

4. Create **four one-time products**:

| Product Name | Price | Save Price ID As |
|-------------|-------|-----------------|
| 500K Tokens | $5.00 (one time) | `STRIPE_PRICE_TOKENS_500K` |
| 1.2M Tokens | $10.00 (one time) | `STRIPE_PRICE_TOKENS_1200K` |
| 3.5M Tokens | $25.00 (one time) | `STRIPE_PRICE_TOKENS_3500K` |
| 8M Tokens | $50.00 (one time) | `STRIPE_PRICE_TOKENS_8M` |

For each product: "+ Add product" → set name, set price as "one time", save, then copy the Price ID.

You should now have **7 Price IDs** written down. Keep them safe.

---

## Step 9 — Set Up Google Sign-In

This lets users click "Sign in with Google" instead of creating a password.

### How to do it:

1. Go to **https://console.cloud.google.com**
2. Create a new project (click the project dropdown at the top → "New Project" → name it "OpenClaw" → Create)
3. Select your new project
4. Go to **APIs & Services** → **OAuth consent screen**
   - Choose "External" → Create
   - App name: your platform name
   - User support email: your email
   - Developer contact: your email
   - Click "Save and Continue" through the rest (you can skip scopes and test users for now)
   - Click "Publish App" to make it available to everyone

5. Go to **APIs & Services** → **Credentials**
6. Click **"+ Create Credentials"** → **"OAuth client ID"**
7. Application type: **Web application**
8. Name: `OpenClaw Web`
9. **Authorized JavaScript origins** — add these:
   - `https://yourdomain.com`
   - `http://localhost:3000` (for local testing)
10. **Authorized redirect URIs** — add these:
    - `https://yourdomain.com/auth/callback`
    - `http://localhost:3000/auth/callback`
11. Click **Create**
12. You'll see your **Client ID** (looks like `123456789-abcdef.apps.googleusercontent.com`). **Copy this and save it.**

---

## Step 10 — Set Up AWS S3 (File Storage)

S3 stores user files and backups of their AI agent data. When a user's container goes to sleep (to save resources), their data gets saved to S3. When they come back, it gets restored.

### How to do it:

1. Go to **https://aws.amazon.com** and create an account (requires a credit card but won't charge you right away — the free tier is generous)
2. Once logged into the **AWS Console**, search for **"IAM"** in the top search bar
3. Click **"Users"** in the left sidebar → **"Create user"**
4. Username: `openclaw-s3`
5. Click "Next"
6. Choose **"Attach policies directly"**
7. Search for `AmazonS3FullAccess` and check the box
8. Click "Next" → "Create user"
9. Click on the user you just created → **"Security credentials"** tab
10. Click **"Create access key"**
11. Use case: select "Application running outside AWS"
12. Click "Create access key"
13. **Copy both keys immediately:**
    - Access Key ID (starts with `AKIA...`)
    - Secret Access Key
    - **You will NOT be able to see the secret again.** Save it now.

### Create an S3 Bucket

1. In the AWS Console, search for **"S3"**
2. Click **"Create bucket"**
3. Bucket name: `openclaw-users` (or whatever you prefer, but it must be globally unique)
4. Region: `us-east-1` (or whichever is closest to your server)
5. Leave all other settings as default
6. Click "Create bucket"

---

## Step 11 — Set Up Resend (Emails)

Resend sends transactional emails to your users — welcome emails when they sign up, payment receipts, password reset links, etc. Without this, your platform can't communicate with users via email.

### 11a. Create a Resend Account

1. Go to **https://resend.com** and sign up (you can use Google sign-in)
2. The free plan gives you 3,000 emails per month — more than enough to start

### 11b. Get Your API Key

1. Go to **https://resend.com/api-keys**
2. Click **"Create API Key"**
3. Name: `OpenClaw`
4. Permission: Select **"Sending access"** (not full access — you only need to send emails)
5. Click **Create**
6. **Copy the API key** (starts with `re_...`) — you won't see it again after you leave this page

### 11c. Verify Your Domain (So Emails Come From You)

By default, Resend sends emails from their own domain. We want emails to come from `noreply@yourdomain.com` so they look professional and don't end up in spam. To do that, you need to prove you own the domain.

1. In Resend, go to **Domains** (left sidebar) → click **"Add Domain"**
2. Enter your domain: `yourdomain.com`
3. Resend will show you **DNS records to add** — usually something like:
   - 1-2 **TXT** records (for SPF and DKIM — these prove you're allowed to send email from this domain)
   - 1-2 **CNAME** records (for email authentication)

4. **Now go to Cloudflare** to add these records:
   - Log into **cloudflare.com** → click your domain → click **"DNS"** in the sidebar
   - For each record Resend gives you, click **"+ Add record"**
   - Match the **Type** (TXT or CNAME), **Name**, and **Value** exactly as Resend shows
   - **Important:** For these email records, set the proxy status to **"DNS only"** (grey cloud, NOT orange). Email DNS records should never be proxied.
   - Click **Save** for each one

5. Go back to Resend and click **"Verify"**
   - Since you're using Cloudflare, this usually verifies within 1-5 minutes (much faster than other DNS providers)
   - If it doesn't verify immediately, wait 10 minutes and try again

Once verified, you'll see a green checkmark next to your domain in Resend. Emails will now come from `noreply@yourdomain.com`.

---

## Step 12 — Get Your AI API Keys

Your platform uses AI models from OpenAI and Anthropic. Users' messages go through these APIs.

### OpenAI (GPT-4, GPT-4o-mini, etc.)

1. Go to **https://platform.openai.com/api-keys**
2. Sign up / log in
3. Click **"Create new secret key"**
4. Name: `OpenClaw`
5. **Copy the key** (starts with `sk-...`). You won't see it again.
6. Add billing: Go to **Settings → Billing** → add a payment method and set a spending limit (start with $20)

### Anthropic (Claude)

1. Go to **https://console.anthropic.com/settings/keys**
2. Sign up / log in
3. Click **"Create Key"**
4. Name: `OpenClaw`
5. **Copy the key** (starts with `sk-ant-...`)
6. Add billing: Go to **Plans** → choose a plan or add credits

---

## Step 13 — Set Up Hetzner Cloud (Auto Server Creation)

> **Quick reference:** See **[WORKER_SETUP.md](WORKER_SETUP.md)** for a short checklist.

**This is the magic part.** Your platform automatically creates brand-new worker servers when capacity runs low. No manual work. When existing workers pass 85% RAM usage, your API calls Hetzner Cloud to spin up a new VPS. Hetzner creates it in ~60 seconds, a cloud-init script installs Docker + Traefik, and the new server registers itself with your platform. Fully automatic.

**Why Hetzner instead of Hostinger?** Hetzner Cloud has a fully functional API for creating servers programmatically — no limitations, no beta restrictions. Servers start at ~$4.35/month (2 vCPU, 4GB RAM) with hourly billing.

### 13a. Get Your Hetzner Cloud API Token

1. Sign up at **https://console.hetzner.cloud** (free account creation)
2. Create a project (or use the default one)
3. Go to **Security** → **API tokens** → **Generate API token**
4. Select **Read & Write** permissions
5. **Copy the token immediately** — this is your `HETZNER_API_TOKEN`

> **Keep this token secret.** Anyone with it can create or delete servers on your account (which costs money).

### 13b. How Auto-Scaling Works — The Full Picture

```
SITUATION: You have 25 users on Worker Server #1.
Server #1 has 8GB RAM, and 7GB is used (87.5%). That's over 85%.

WHAT HAPPENS AUTOMATICALLY:

1. Every 5 minutes, your API checks all worker servers' RAM usage
2. Server #1 reports 87.5% → over the 85% threshold
3. Your API calls Hetzner: "Create a cx22 server in Ashburn"

4. Hetzner creates the VPS in ~60 seconds
5. Cloud-init runs automatically:
   a. Installs Docker
   b. Sets up Traefik (the traffic router for subdomains)
   c. Builds/pulls the openclaw container image
   d. Calls YOUR API: "I'm a new server! IP=45.67.89.12, RAM=4096MB"

6. Your API adds the new server to its database
7. New users get placed on the new server automatically
```

### 13c. What Server Type Gets Created

Default: **cx22** (2 vCPU, 4GB RAM, ~€4.35/mo). Change in `.env`:

```bash
HETZNER_SERVER_TYPE=cx22   # cx22=4GB, cx32=8GB, cx42=16GB
HETZNER_LOCATION=ash       # ash (US-East), hil (US-West), nbg/fsn/hel (EU), sin (SG)
```

### 13d. How DNS Works for Worker Server Users

Remember the wildcard DNS record (`*`) from Step 3? That routes all subdomains:

```
User types: john123.yourdomain.com
    ↓
Cloudflare sees * wildcard → sends to worker server IP
    ↓
Traefik on the worker sees john123.yourdomain.com → routes to john123's container
    ↓
User sees their AI agent dashboard
```

### 13e. What If I Don't Want Auto-Scaling Yet?

That's fine. You can manually create servers on Hetzner's dashboard and run the setup script yourself:

```bash
ssh root@NEW_SERVER_IP
curl -sf https://raw.githubusercontent.com/YOUR_USERNAME/openclaw-platform/main/scripts/server-setup.sh | \
  ADMIN_EMAIL=you@email.com \
  PLATFORM_API=https://api.yourdomain.com \
  INTERNAL_SECRET=your_64_char_secret \
  bash
```

This manually sets up a worker server. Your platform will then discover it when the script calls the registration endpoint.

---

## Step 14 — Fill In Your Environment File

Now we put all the keys and passwords we've collected into one file.

### On your server, create the .env file:

```bash
cd /opt/openclaw-platform
cp .env.example .env
nano .env
```

This opens a text editor. Replace every placeholder value with the real values you collected. Here's what each line should look like (with YOUR actual values):

```ini
# ── Database ──
DATABASE_URL=postgresql://openclaw:YOUR_POSTGRES_PASSWORD@localhost:5432/openclaw

# ── Redis ──
REDIS_URL=redis://localhost:6379

# ── Stripe ──
STRIPE_SECRET_KEY=sk_live_YOUR_ACTUAL_KEY
STRIPE_WEBHOOK_SECRET=whsec_FILL_THIS_IN_STEP_20
STRIPE_PRICE_STARTER=price_YOUR_STARTER_ID
STRIPE_PRICE_PRO=price_YOUR_PRO_ID
STRIPE_PRICE_BUSINESS=price_YOUR_BUSINESS_ID
STRIPE_PRICE_TOKENS_500K=price_YOUR_500K_ID
STRIPE_PRICE_TOKENS_1200K=price_YOUR_1200K_ID
STRIPE_PRICE_TOKENS_3500K=price_YOUR_3500K_ID
STRIPE_PRICE_TOKENS_8M=price_YOUR_8M_ID

# ── AI Keys ──
OPENAI_API_KEY=sk-YOUR_OPENAI_KEY
ANTHROPIC_API_KEY=sk-ant-YOUR_ANTHROPIC_KEY

# ── AWS S3 ──
AWS_ACCESS_KEY_ID=AKIA_YOUR_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=YOUR_SECRET_KEY
AWS_REGION=us-east-1
S3_BUCKET_PREFIX=openclaw-users

# ── Email ──
RESEND_API_KEY=re_YOUR_RESEND_KEY
EMAIL_FROM=noreply@yourdomain.com

# ── Platform URLs ──
PLATFORM_URL=https://yourdomain.com
API_URL=https://api.yourdomain.com
DOMAIN=yourdomain.com

# ── Google Sign-In ──
GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com

# ── Security Secrets ──
# Generate each one by running this command three times:
#   openssl rand -hex 32
# Each one should be a different 64-character string.
JWT_SECRET=PASTE_64_CHAR_HEX_STRING_1
ENCRYPTION_KEY=PASTE_64_CHAR_HEX_STRING_2
INTERNAL_SECRET=PASTE_64_CHAR_HEX_STRING_3

# ── Hetzner Cloud Auto-Scaling ──
HETZNER_API_TOKEN=PASTE_YOUR_HETZNER_API_TOKEN

# ── Server Config ──
PORT=4000
NODE_ENV=production
```

### Generate Security Secrets

Run this command **three times** to get three different random strings:

```bash
openssl rand -hex 32
```

Each one gives you a 64-character string like `a3f8b2c1d4e5...`. Paste each one into `JWT_SECRET`, `ENCRYPTION_KEY`, and `INTERNAL_SECRET`.

### Save the File

In nano: Press `Ctrl + X`, then `Y`, then `Enter`.

### Create Dashboard Environment File Too

```bash
nano dashboard/.env.local
```

Put this in it:
```ini
NEXT_PUBLIC_API_URL=https://api.valnaa.com
NEXT_PUBLIC_GOOGLE_CLIENT_ID=383333552636-b4c6aaj148mfhskfnjpr2br6bqg4miam.apps.googleusercontent.com
NEXT_PUBLIC_PLATFORM_URL=https://valnaa.com
```

Save with `Ctrl + X`, `Y`, `Enter`.

---

## Step 15 — Run the Database Migrations

Migrations create all the tables your database needs (users, payments, settings, etc.).

```bash
cd /opt/openclaw-platform
npm run migrate
```

You should see output like:
```
▶  Applying 001_initial_schema.sql...
✓  001_initial_schema.sql applied
▶  Applying 002_google_auth.sql...
✓  002_google_auth.sql applied

All migrations complete.
```

If you see an error about "connection refused", make sure PostgreSQL is running:
```bash
docker ps | grep postgres
```

---

## Step 16 — Build and Start the API

### Build It

```bash
cd /opt/openclaw-platform/api
npm run build
```

This compiles the TypeScript code into regular JavaScript. Should take 10-30 seconds.

### Test It

```bash
npm start
```

You should see something like:
```
OpenClaw API running on port 4000
```

Press `Ctrl + C` to stop it for now (we'll set it up to run permanently later).

---

## Step 17 — Build and Start the Dashboard

### Build It

```bash
cd /opt/openclaw-platform/dashboard
npm run build
```

This takes 1-3 minutes. Next.js compiles all the pages into optimized files.

### Test It

```bash
npm start
```

Should show something like:
```
▲ Next.js 16.x.x
- Local: http://localhost:3000
```

Press `Ctrl + C` to stop it for now.

---

## Step 18 — Set Up Nginx (Makes Everything Public)

Nginx is the "front door" of your server. When someone visits `yourdomain.com`, Nginx decides where to send them — to the dashboard (port 3000) or the API (port 4000).

### Create the Nginx Configuration

```bash
nano /etc/nginx/sites-available/openclaw
```

Paste this entire block (replace `yourdomain.com` with your actual domain):

```nginx
# Dashboard — valnaa.com
server {
    listen 80;
    server_name valnaa.com www.valnaa.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# API — api.valnaa.com
server {
    listen 80;
    server_name api.valnaa.com;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Save and exit (`Ctrl + X`, `Y`, `Enter`).

### Enable the Configuration

```bash
ln -sf /etc/nginx/sites-available/openclaw /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
```

That last command checks for errors. If it says `syntax is ok` and `test is successful`, you're good.

### Restart Nginx

```bash
systemctl restart nginx
systemctl enable nginx
```

---

## Step 19 — Set Up SSL (HTTPS / The Padlock)

**What is SSL/HTTPS?** SSL encrypts the data between your users' browsers and your server. Without it, passwords and payment info could be intercepted. With it, you get the padlock icon in the browser bar and `https://` instead of `http://`. Every serious website needs this. Google also ranks HTTPS sites higher in search results.

**The good news:** You actually have TWO layers of SSL working for you:
1. **Cloudflare** automatically handles SSL between the user's browser and Cloudflare (this is already working from Step 1)
2. **Let's Encrypt** handles SSL between Cloudflare and your server (we'll set this up now)

This is why we set Cloudflare to "Full (strict)" mode in Step 1 — it ensures the ENTIRE chain is encrypted, not just half of it.

### 19a. Get SSL Certificates with Certbot

**Important:** Before running this, make sure your DNS is fully working. Test by visiting `http://yourdomain.com` in a browser — you should see *something* (even an Nginx default page or an error is fine, as long as it loads and doesn't say "site not found").

If you're using Cloudflare with the orange cloud (Proxied) enabled, you may need to **temporarily pause Cloudflare** or **set the records to DNS only (grey cloud)** for certbot to work. Here's why: certbot needs to verify you own the domain by placing a file on your server and then checking it. If Cloudflare is proxying, certbot might verify against Cloudflare's IP instead of yours.

**Option A — Temporarily disable Cloudflare proxy (easiest):**
1. Go to Cloudflare → DNS → click the orange cloud next to `@`, `www`, and `api` records to turn them grey (DNS only)
2. Wait 2-3 minutes for the change to take effect
3. Run certbot (see below)
4. After certbot succeeds, turn the orange clouds back on

**Option B — Use Cloudflare's own SSL (skip certbot entirely):**
If you don't want to deal with certbot at all, Cloudflare provides free SSL automatically. As long as Cloudflare is set to "Full" or "Flexible" mode (not "Full strict"), it works without any certificate on your server. But "Full (strict)" is more secure and requires a certificate on your server.

### Run Certbot

```bash
certbot --nginx -d valnaa.com -d www.valnaa.com -d api.valnaa.com
```

Replace `yourdomain.com` with your actual domain.

It will ask you a few questions:
- **Email address:** Enter yours (they'll send renewal reminders — this is useful, not spam)
- **Terms of service:** Type `Y` and press Enter
- **Share email with EFF:** Type `N` (or `Y`, your choice — doesn't matter)

If everything works, you'll see a message like:
```
Congratulations! Your certificate and chain have been saved.
```

Certbot automatically updates your Nginx configuration to use HTTPS. You don't need to edit Nginx files again.

### 19b. Turn Cloudflare Proxy Back On

If you turned off the orange cloud in Step 19a, turn it back on now:
1. Cloudflare → DNS → click the grey cloud next to `@`, `www`, and `api` records to make them orange again

### 19c. Set Up Auto-Renewal

SSL certificates expire every 90 days. Certbot can renew them automatically so you never have to think about it:

```bash
certbot renew --dry-run
```

If this succeeds (says "Congratulations" or "simulating renewal"), automatic renewal is already configured. Certbot will renew your certificates in the background before they expire.

### 19d. Verify HTTPS is Working

Open your browser and visit:
- `https://yourdomain.com` — should show your site with a padlock icon
- `https://api.yourdomain.com` — should respond (even if it's just a JSON message)

If you see the padlock, you're done. Your site is secure.

---

## Step 20 — Set Up Stripe Webhooks

Webhooks are how Stripe tells your platform about events — "this user just paid", "this subscription was cancelled", etc.

### How to do it:

1. Go to **https://dashboard.stripe.com/webhooks**
2. Click **"+ Add endpoint"**
3. Endpoint URL: `https://api.yourdomain.com/webhooks/stripe`
4. Select events to listen to (click "Select events"):
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Click **"Add endpoint"**
6. On the webhook page, click **"Reveal"** under "Signing secret"
7. **Copy the webhook secret** (starts with `whsec_...`)

### Update Your .env File

```bash
nano /opt/openclaw-platform/.env
```

Find the line `STRIPE_WEBHOOK_SECRET=whsec_FILL_THIS_IN_STEP_20` and replace it with the actual value you just copied.

Save and exit.

---

## Step 21 — Test Everything

### Start the API and Dashboard Again

We'll use the process manager in the next step, but for now let's test:

**Terminal 1 (API):**
```bash
cd /opt/openclaw-platform/api && npm start
```

**Terminal 2 (Dashboard):** Open a second SSH connection and run:
```bash
cd /opt/openclaw-platform/dashboard && npm start
```

### Check These URLs

Open a browser and visit:

1. **`https://yourdomain.com`** — You should see the landing page / dashboard
2. **`https://api.yourdomain.com`** — You should see a response (might be a JSON message like "OpenClaw API is running" or a 404 page — both are fine, it means the API is reachable)
3. **Try signing up** — Click "Sign up" or "Sign in with Google" and make sure the flow works

### If Something Doesn't Work

- **"This site can't be reached"** → DNS hasn't propagated yet. Wait 15-30 minutes and try again.
- **"502 Bad Gateway"** → The API or dashboard isn't running. Check that both are started.
- **"Connection refused"** → Nginx might not be running. Run `systemctl status nginx`.
- **Database errors in the API** → Check that PostgreSQL is running: `docker ps | grep postgres`.

---

## Step 22 — Keep It Running Forever (Process Manager)

Right now, if you close your SSH terminal, everything stops. We need a process manager to keep the API and dashboard running 24/7, and restart them if they crash.

### Install PM2

```bash
npm install -g pm2
```

### Start the API with PM2

```bash
cd /opt/openclaw-platform/api
pm2 start dist/index.js --name "openclaw-api"
```

### Start the Dashboard with PM2

```bash
cd /opt/openclaw-platform/dashboard
pm2 start npm --name "openclaw-dashboard" -- start
```

### Make PM2 Start on Boot

```bash
pm2 save
pm2 startup
```

It will print a command. **Copy and paste that command** and run it. This ensures PM2 and your apps start automatically if the server ever reboots.

### Useful PM2 Commands

```bash
pm2 list              # See what's running
pm2 logs              # See live logs from both apps
pm2 logs openclaw-api # See only API logs
pm2 restart all       # Restart everything
pm2 stop all          # Stop everything
pm2 monit             # Live monitoring dashboard
```

---

## How Auto Server Creation Works

Here's a complete summary of what happens end-to-end:

### When a New User Signs Up

```
1. User visits yourdomain.com and clicks "Sign Up"
2. They choose a plan (Starter/Pro/Business) and pay via Stripe
3. Stripe confirms payment and sends a webhook to your API
4. Your API runs the "provisionUser" function:
   a. Picks the best worker server (one with the most free RAM)
   b. Creates an S3 bucket for the user's data
   c. SSHs into the worker server
   d. Creates a Docker container with resource limits based on their plan:
      - Starter: 1GB RAM, 0.25 CPU
      - Pro:     2GB RAM, 0.5 CPU
      - Business: 4GB RAM, 1.0 CPU
   e. Sets up Traefik routing so username.yourdomain.com → their container
5. Container starts, passes health check
6. User gets a welcome email with their dashboard link
7. Total time: ~30-60 seconds
```

### When Servers Get Full

```
1. A background job checks server RAM usage every few minutes
2. If any server passes 85% RAM usage...
3. Your API calls Hetzner: "Create a new cx22 VPS with Ubuntu 22.04"
4. Hetzner creates the server (~60 seconds)
5. The post-install script runs automatically on the new server:
   a. Installs Docker + Docker Compose + Node.js
   b. Sets up Traefik (handles SSL + routing)
   c. Calls your API to register: "I'm new! My IP is X, I have Y MB RAM"
6. Your API adds this server to its database
7. New users can now be placed on this server
```

### When a User's Container Goes Idle

```
1. If a container has no activity for 30 minutes...
2. Your platform syncs the container's data to S3 (backup)
3. Stops the container (frees up RAM)
4. When the user comes back:
   a. Downloads their data from S3
   b. Starts the container back up (~10 seconds)
   c. User doesn't notice anything different
```

---

## Monthly Costs Breakdown

### Fixed Costs (You Pay No Matter What)

| Item | Cost |
|------|------|
| Main server (Hostinger KVM2) | ~$10/mo |
| Domain name | ~$1/mo |
| **Subtotal** | **~$11/mo** |

### Scaling Costs (Grow With Users)

| Item | Cost | When |
|------|------|------|
| Worker server (KVM8) | ~$25/mo each | 1 per ~15-30 users |
| AWS S3 storage | ~$0.023/GB/mo | Grows slowly |
| Resend emails | Free → $20/mo | Free up to 3K emails |
| OpenAI API | ~$0.15-15/1M tokens | Based on user usage |
| Anthropic API | ~$3-15/1M tokens | Based on user usage |

### Example: 100 Users

| Item | Cost |
|------|------|
| Main server | $16/mo (KVM4) |
| 3-4 worker servers | $75-100/mo |
| AI API costs | ~$50-200/mo |
| S3 storage | ~$2/mo |
| Domain | $1/mo |
| **Total** | **~$150-320/mo** |
| **Revenue** (100 users × $10-50/mo) | **$1,000-5,000/mo** |

---

## Troubleshooting

### "I can't connect to my server via SSH"

- Double-check the IP address — go to Hostinger dashboard and verify it
- Make sure you're typing `root` as the username: `ssh root@YOUR_IP`
- If using a password, make sure caps lock is off (password is case-sensitive)
- The password doesn't show as you type — that's normal, just type carefully and press Enter
- Some ISPs or networks block port 22. Try from a different WiFi network or use your phone's hotspot.
- If Hostinger's panel has a "Console" or "Terminal" button, try using that as an alternative to SSH

### "Cloudflare says 'Pending Nameserver Update'"

- This means your domain registrar hasn't switched to Cloudflare's nameservers yet
- Go back to your registrar (Namecheap, GoDaddy, etc.) → domain settings → nameservers
- Make sure you entered both Cloudflare nameservers exactly as shown (no typos!)
- It can take up to 24 hours, but usually happens within 1-2 hours
- Cloudflare will email you when it's active

### "My domain doesn't load anything / 'Site can't be reached'"

- **Check DNS first:** Go to https://dnschecker.org → type your domain → check if the A record shows your server's IP
- If DNS looks correct but the site doesn't load:
  - Make sure Nginx is running on your server: `systemctl status nginx`
  - Make sure the API and dashboard are running: `pm2 list`
- If using Cloudflare proxied (orange cloud) and you see a Cloudflare error page:
  - Check that Nginx is running and listening on port 80/443
  - Try temporarily setting the DNS record to "DNS only" (grey cloud) to test direct connection

### "Error 521 / 522 / 523 (Cloudflare errors)"

These are Cloudflare-specific errors:
- **521 (Web server is down):** Your server isn't responding. Check that Nginx is running: `systemctl status nginx` and `pm2 list`
- **522 (Connection timed out):** Cloudflare can't reach your server. Check your server's firewall allows port 80 and 443: `ufw status` (if `ufw` is active, run `ufw allow 80` and `ufw allow 443`)
- **523 (Origin is unreachable):** Your server's IP might be wrong in Cloudflare DNS. Double-check the A record IP matches your Hostinger server IP.

### "502 Bad Gateway"

- The API or dashboard crashed but Nginx is still running. Nginx is saying "I tried to forward the request but nobody answered."
- Check what's running: `pm2 list`
- Check logs for errors: `pm2 logs`
- Restart everything: `pm2 restart all`
- If you just updated code, rebuild first: `cd /opt/openclaw-platform/api && npm run build && pm2 restart openclaw-api`

### "SSL / HTTPS not working"

- If using Cloudflare with orange cloud: Cloudflare provides SSL automatically. Make sure SSL mode is set to "Full" in Cloudflare → SSL/TLS settings
- If certbot failed: Make sure your domain's DNS points to your server and is accessible. Try temporarily turning off Cloudflare proxy (grey cloud), running certbot, then turning proxy back on.
- Check if certbot certificates exist: `certbot certificates`
- Force renewal: `certbot renew --force-renewal`

### "Database connection error"

- Check PostgreSQL is running: `docker ps | grep postgres`
- If not running, start it: `docker start openclaw-postgres`
- If it still won't start, check Docker logs: `docker logs openclaw-postgres`
- Check the `DATABASE_URL` in your `.env` file — make sure the password matches what you set when creating the container
- Test the connection manually: `docker exec openclaw-postgres psql -U openclaw -d openclaw -c "SELECT 1"`

### "Redis connection error"

- Check Redis is running: `docker ps | grep redis`
- If not running: `docker start openclaw-redis`
- Test the connection: `docker exec openclaw-redis redis-cli ping` (should say "PONG")

### "Stripe payments aren't working"

- Make sure you're using the right keys — **test keys** (`sk_test_...`) for testing, **live keys** (`sk_live_...`) for real payments
- Check the webhook: go to Stripe dashboard → Webhooks → click on your endpoint → check for failed deliveries (red rows)
- Make sure the webhook URL is `https://api.yourdomain.com/webhooks/stripe` (with **https**, not http)
- Make sure `STRIPE_WEBHOOK_SECRET` in `.env` matches what Stripe shows
- Test with Stripe CLI: install the Stripe CLI and run `stripe listen --forward-to localhost:4000/webhooks/stripe`

### "Google Sign-In doesn't work"

- Make sure `https://yourdomain.com` is listed in **"Authorized JavaScript origins"** in Google Cloud Console
- Make sure `https://yourdomain.com/auth/callback` is listed in **"Authorized redirect URIs"**
- Make sure the `GOOGLE_CLIENT_ID` in both `.env` and `dashboard/.env.local` matches exactly
- If using Cloudflare proxy, the origin might show a different URL — make sure you're using your domain, not the Cloudflare one
- You may need to wait a few minutes after making changes in Google Cloud

### "Auto-scaling isn't creating servers"

- Check your `HETZNER_API_TOKEN` is correct in `.env`
- Make sure your Hetzner account has a payment method added
- Check the API logs for errors: `pm2 logs openclaw-api --lines 100`
- Test the API token manually:
  ```bash
  curl -H "Authorization: Bearer YOUR_HETZNER_TOKEN" \
    https://api.hetzner.cloud/v1/servers
  ```
  If this returns a list (even empty), your token works. If it returns an error, the token is wrong.

### "New worker server didn't register with the platform"

- SSH into the new worker server and check if the setup script ran: `ls /opt/openclaw/`
- Check if Traefik is running: `docker ps | grep traefik`
- Check the script output: `journalctl -u cloud-init --no-pager | tail -50` (or check `/var/log/cloud-init-output.log`)
- Try manually registering by running the curl command from the setup script

### "User containers won't start"

- SSH into the worker server and check Docker: `docker ps -a` (shows all containers, including stopped ones)
- Check container logs: `docker logs openclaw-USERID`
- Make sure the Docker image exists: `docker pull openclaw/openclaw:latest`
- Check if the server has enough RAM: `free -h`

### Useful Monitoring Commands

```bash
# Check server resource usage (live dashboard — press Q to quit)
htop

# Check disk space
df -h

# Check RAM usage
free -h

# Check all Docker containers (including stopped ones)
docker ps -a

# Check PM2 processes
pm2 list

# Check live logs (Ctrl+C to stop watching)
pm2 logs

# Check only API logs (last 50 lines)
pm2 logs openclaw-api --lines 50

# Check Nginx status
systemctl status nginx

# Check if specific ports are being used
ss -tlnp | grep -E '80|443|3000|4000'

# Check server uptime (how long since last reboot)
uptime

# Check Cloudflare is reaching your server (run from your laptop, not the server)
# curl -I https://yourdomain.com
```

---

## Quick Reference — All Your Saved Values

Use this as a checklist. Fill it in as you go through each step:

```
STEP 1 — DOMAIN + CLOUDFLARE
Domain name:              ____________________
Cloudflare nameserver 1:  ____________________
Cloudflare nameserver 2:  ____________________
Cloudflare SSL mode:      Full (strict) ✓

STEP 2 — HOSTINGER SERVER
Server IP address:        ____________________
Root password:            ____________________
Server plan:              KVM __
Data center region:       ____________________

STEP 6 — DATABASE
PostgreSQL password:      ____________________

STEP 8 — STRIPE
Stripe Secret Key:        sk_live_____________
Stripe Webhook Secret:    whsec_______________
Stripe Price IDs:
  Starter:                price_______________
  Pro:                    price_______________
  Business:               price_______________
  500K Tokens:            price_______________
  1.2M Tokens:            price_______________
  3.5M Tokens:            price_______________
  8M Tokens:              price_______________

STEP 9 — GOOGLE SIGN-IN
Google Client ID:         ____________________

STEP 10 — AWS S3
AWS Access Key ID:        AKIA________________
AWS Secret Access Key:    ____________________
S3 Bucket Name:           ____________________
AWS Region:               ____________________

STEP 11 — RESEND
Resend API Key:           re__________________
Domain verified?          Yes / No

STEP 12 — AI KEYS
OpenAI API Key:           sk__________________
Anthropic API Key:        sk-ant______________

STEP 13 — HETZNER CLOUD
Hetzner API Token:        ____________________

STEP 14 — SECURITY SECRETS
JWT Secret:               ____________________
Encryption Key:           ____________________
Internal Secret:          ____________________
```

---

**That's it! Your OpenClaw platform is now live.** Users can visit your domain, sign up, pay, and get their own AI agent — all automatically. As you grow, worker servers will be created on their own. Welcome to the business.
