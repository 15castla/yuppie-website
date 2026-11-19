#!/bin/bash
# After a container restart: the hosts lines for the HTTPS fakes and the fake Apple push service, then the local stack.
grep -q "api.stripe.com" /etc/hosts || echo "127.0.0.1 api.stripe.com api.resend.com api.twilio.com fake-anthropic.test" >> /etc/hosts
grep -q "fake-apns.test" /etc/hosts || echo "127.0.0.1 fake-apns.test" >> /etc/hosts
bash /home/claude/stack/start.sh
