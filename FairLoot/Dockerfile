# ── Build stage ──
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# copy csproj first for layer caching
COPY FairLoot/FairLoot.csproj FairLoot/
RUN dotnet restore FairLoot/FairLoot.csproj

# copy everything else and publish
COPY FairLoot/ FairLoot/
RUN dotnet publish FairLoot/FairLoot.csproj -c Release -o /app/out

# ── Runtime stage ──
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app/out .

ENV ASPNETCORE_ENVIRONMENT=Production

# Render injects PORT env var
EXPOSE 10000
CMD ["dotnet", "FairLoot.dll"]
