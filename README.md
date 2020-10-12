# istio-https-grpc
Setup for an EKS cluster with easy experimenting with Istio

## ./cluster

I'm lazy so I used Pulumi and the default Pulumi module to create my EKS cluster and IAM roles for `external-dns` and `cert-manager`.

## ./helmfile.*

This is how I deployed Istio. Service account names are/were hardcoded since I'm lazy.

## ./application

This is where I defined the gRPC application to deploy. I wrote a micro helm chart that wrapped [yages](https://github.com/mhausenblas/yages).

## Findings

Curiously, after using [ghz](https://github.com/bojand/ghz) to do load testing, I noticed that if I sent individual `grpcurl` requests, every so often the requests would take 5 or even 10 seconds. Once I started using `ghz` and started generating more load, I saw the mean latency go down.

I experimented with the `istio-ingressgateway` replica set size, resources, as well as the `yages` resources but the results were almost always the same.

I stayed around 500 QPS. It's possible that had I given everything more than just 200mCPU that maybe we wouldn't have the same problem? But I didn't want to pay for larger instance types out of my own pocket. I did some brief searching for any known performance problems but I couldn't find anything definitive.

When installing all of the Istio addons and looking at tracing data in Kiali, everything showed latencies that were roughly as expected.

When I did a direct `port-forward`, I didn't see anything change much, so it's really hard to know if this is a problem with Istio itself or if it was just the application or if it's Kubernetes or what. But with a single pod with nearly 0 resources, it's not all too definitive.
