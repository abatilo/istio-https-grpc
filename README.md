# istio-https-grpc

Civo has a beta program with a free \$70/month credit for hosting a Kubernetes
cluster that's built with [k3s](https://k3s.io/).

You can sign up through my referral by [clicking
here](https://www.civo.com/?ref=4c9f88). I get \$20 for every person that signs
up and launches a free k3s cluster. No credit card required. Would be much appreciated!

What I decided to try figuring out on this cluster is how to deploy Istio and
doing an http01 certificate validation using Istio 1.8.

My Civo k3s cluster runs on `v1.18.6+k3s1`.

## Setting Up

Primary tools being used:

```
⇒  cat .tool-versions
helm 3.4.1
helmfile 0.134.1
istioctl 1.8.0
kubectl 1.18.2
grpcurl 1.7.0
```

We use the `createNamespace` feature that's only available in helm 3.2+.

Helm plugins:

```
⇒  helm plugin ls
NAME            VERSION DESCRIPTION
helm-git        0.10.0  Get non-packaged Charts directly from Git.
```

Since the istio charts aren't hosted anywhere, we rely on `helm-git` to
dynamically clone and generate the istio charts that are available [in the
repo](https://github.com/istio/istio/tree/c87a4c874df27e37a3e6c25fa3d1ef6279685d23/manifests/charts).

## Getting it to work

You'll likely need to run `helmfile sync` twice. Unfortunately, even though we
set a `needs` relationship for the `ClusterIssuer` on needing `cert-manager`
to be installed, the `cert-manager` CRDs aren't available immediately.

We use `helmfile sync` since it doesn't force a `helmfile diff` which can be
problematic when CRDs aren't already installed into a cluster.

The first time that you run `helmfile sync` you'll find something like:

```
⇒  helmfile sync
...
ERROR:
  exit status 1

EXIT STATUS
  1

STDERR:
  WARNING: This chart is deprecated
  Error: Internal error occurred: failed calling webhook "webhook.cert-manager.io": Post https://cert-manager-webhook.cert-manager.svc:443/mutate?timeout=10s: x509: certificate signed by unknown authority

COMBINED OUTPUT:
  Release "cluster-issuer" does not exist. Installing it now.
  WARNING: This chart is deprecated
  Error: Internal error occurred: failed calling webhook "webhook.cert-manager.io": Post https://cert-manager-webhook.cert-manager.svc:443/mutate?timeout=10s: x509: certificate signed by unknown authority
```

Run `helmfile sync` again and it should install everything else as expected.

Starting in Istio 1.8, an [official method for installing with
helm](https://istio.io/v1.8/docs/setup/install/helm/) was resurrected. A helm
chart method was deprecated in favor of the operator installation method for a
while and was recently brought back.

We register a global `ClusterIssuer` for cert-manager that lets us provision
certificates in any namespace and is configured to use http01 challenges. And
we register a global `Gateway` that listens on port 80/http to respond to
http01 challenges. At some point, Istio started enabling the k8s Ingress
provider by default. This used to be disabled by default, but we need it
enabled because `cert-manager` will register a temporary `Ingress` resource to
respond to the actual http01 challenge. We give the globally shared `Gateway` a
wildcard host so that it can be used by multiple applications. Read through the
[helmfile.yaml](./helmfile.yaml) for more information on what all has been
installed and how it has been configured.

After we've installed all of the main pieces to the cluster, we can install an
application to demonstrate the TLS termination.

```
⇒  kubectl apply -f https-yages.yaml
namespace/yages created
deployment.apps/yages created
service/yages created
certificate.cert-manager.io/yages created
gateway.networking.istio.io/yages created
virtualservice.networking.istio.io/yages created
```

Let's verify that the `Certificate` gets issued. It shouldn't take very long
but eventually the `READY` column will show `True`

```
⇒  kubectl get certificates.cert-manager.io --all-namespaces
NAMESPACE      NAME    READY   SECRET       AGE
istio-system   yages   True    yages-cert   63s
```

We create a namespace to deploy into with Istio sidecar injection enabled.
Then we deploy an instance of [Yet another gRPC echo
server](https://github.com/mhausenblas/yages). We submit a `Service` to route
to, a `Certificate` request for `cert-manager` to rotate for us, then the
Istio resources configured for doing the TLS termination and routing. Take
note that the `Certificate` resource is in the `istio-system` namespace, but
everything else is in the `yages` namespace. Read through
[https-yages.yaml](./https-yages.yaml) for more information.

Now that everything is running, we can verify by using
[grpcurl](https://github.com/fullstorydev/grpcurl).

```
⇒  grpcurl yages.civo.aaronbatilo.dev:443 yages.Echo.Ping
{
  "text": "pong"
}
```

If you're feeling fiesty, you can generate much more load and do much more
aggressive testing with [ghz](https://github.com/bojand/ghz).

```
⇒  ghz --call=yages.Echo.Ping yages.civo.aaronbatilo.dev:443

Summary:
  Count:        200
  Total:        1.08 s
  Slowest:      629.51 ms
  Fastest:      126.51 ms
  Average:      255.44 ms
  Requests/sec: 185.82

Response time histogram:
  126.507 [1]   |
  176.807 [149] |∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎
  227.107 [0]   |
  277.407 [0]   |
  327.708 [0]   |
  378.008 [0]   |
  428.308 [0]   |
  478.608 [0]   |
  528.908 [2]   |∎
  579.208 [13]  |∎∎∎
  629.508 [35]  |∎∎∎∎∎∎∎∎∎

Latency distribution:
  10 % in 132.34 ms
  25 % in 138.00 ms
  50 % in 146.39 ms
  75 % in 166.30 ms
  90 % in 623.48 ms
  95 % in 624.09 ms
  99 % in 629.15 ms

Status code distribution:
  [OK]   200 responses
```
