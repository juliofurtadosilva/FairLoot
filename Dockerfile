# Build stage
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY FairLoot/FairLoot.csproj FairLoot/
RUN dotnet restore FairLoot/FairLoot.csproj

COPY FairLoot/ FairLoot/
RUN dotnet publish FairLoot/FairLoot.csproj -c Release -o /app/out

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app/out .

ENV ASPNETCORE_ENVIRONMENT=Production

# Render assigns PORT dynamically
CMD ["dotnet", "FairLoot.dll"]